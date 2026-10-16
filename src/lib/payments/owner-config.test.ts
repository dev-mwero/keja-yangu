import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptField, isEncrypted } from "@/lib/crypto";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/models/OwnerPaymentConfig", () => ({
  OwnerPaymentConfig: getModelStubs().ownerpaymentconfig,
}));

const {
  buildOwnerPaymentConfigSet,
  getOwnerPaymentConfig,
  getOwnerPaymentConfigView,
  hasDarajaCredentials,
  resolveDarajaConfig,
  saveOwnerPaymentConfig,
  serializeOwnerPaymentConfig,
} = await import("@/lib/payments/owner-config");

const configStub = getModelStubs().ownerpaymentconfig;

function completeConfig(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: "owner-1",
    darajaEnabled: true,
    daraja: {
      environment: "sandbox",
      consumerKey: "ck",
      consumerSecret: "cs",
      passphrase: "pp",
      shortcode: "174379",
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetModelStubs();
});

describe("hasDarajaCredentials", () => {
  it("is false for null, disabled, or partial configs", () => {
    expect(hasDarajaCredentials(null)).toBe(false);
    expect(hasDarajaCredentials(undefined)).toBe(false);
    expect(hasDarajaCredentials(completeConfig({ darajaEnabled: false }))).toBe(false);
    expect(
      hasDarajaCredentials(completeConfig({ daraja: { environment: "sandbox", shortcode: "1" } })),
    ).toBe(false);
    expect(
      hasDarajaCredentials(
        completeConfig({ daraja: { ...completeConfig().daraja, environment: "x" } }),
      ),
    ).toBe(false);
  });

  it("is true only for an enabled, complete config", () => {
    expect(hasDarajaCredentials(completeConfig())).toBe(true);
    expect(hasDarajaCredentials(completeConfig({ darajaEnabled: true }))).toBe(true);
  });
});

describe("serializeOwnerPaymentConfig", () => {
  it("masks secrets and defaults to sandbox for an empty config", () => {
    const view = serializeOwnerPaymentConfig(null, false);
    expect(view).toEqual({
      daraja: {
        enabled: false,
        environment: "sandbox",
        shortcode: "",
        consumerKeyConfigured: false,
        consumerSecretConfigured: false,
        passphraseConfigured: false,
      },
      mpesaConfigured: false,
      availableMethods: ["manual"],
    });
  });

  it("exposes configured booleans but never secret values", () => {
    const view = serializeOwnerPaymentConfig(completeConfig(), false);
    expect(view.daraja).toEqual({
      enabled: true,
      environment: "sandbox",
      shortcode: "174379",
      consumerKeyConfigured: true,
      consumerSecretConfigured: true,
      passphraseConfigured: true,
    });
    expect(view.mpesaConfigured).toBe(true);
    expect(view.availableMethods).toEqual(["manual", "mpesa"]);
    expect(JSON.stringify(view)).not.toContain("ck");
    expect(JSON.stringify(view)).not.toContain("cs");
  });

  it("reflects the injected paystack flag", () => {
    expect(serializeOwnerPaymentConfig(null, true).availableMethods).toEqual([
      "manual",
      "paystack",
    ]);
    expect(serializeOwnerPaymentConfig(completeConfig(), true).availableMethods).toEqual([
      "manual",
      "mpesa",
      "paystack",
    ]);
  });
});

describe("buildOwnerPaymentConfigSet", () => {
  it("encrypts provided secrets and leaves omitted ones untouched", () => {
    const set = buildOwnerPaymentConfigSet(null, {
      daraja: { consumerKey: "ck", consumerSecret: "" },
    });
    const daraja = set.daraja as Record<string, unknown>;
    expect(isEncrypted(daraja.consumerKey as string)).toBe(true);
    expect(decryptField(daraja.consumerKey as string)).toBe("ck");
    expect(daraja.consumerSecret).toBe("");
    expect("passphrase" in daraja).toBe(false);
  });

  it("preserves existing secrets when a new value is not provided", () => {
    const existing = { daraja: { consumerKey: "enc:v1:old", shortcode: "9" } };
    const set = buildOwnerPaymentConfigSet(existing, { daraja: { shortcode: "10" } });
    const daraja = set.daraja as Record<string, unknown>;
    expect(daraja.consumerKey).toBe("enc:v1:old");
    expect(daraja.shortcode).toBe("10");
  });

  it("updates plain fields and the enabled flag", () => {
    const set = buildOwnerPaymentConfigSet(null, {
      darajaEnabled: true,
      daraja: { environment: "production", shortcode: "123" },
    });
    expect(set.darajaEnabled).toBe(true);
    const daraja = set.daraja as Record<string, unknown>;
    expect(daraja.environment).toBe("production");
    expect(daraja.shortcode).toBe("123");
  });
});

describe("resolveDarajaConfig", () => {
  it("returns null unless the config is complete", () => {
    expect(resolveDarajaConfig(null)).toBeNull();
    expect(resolveDarajaConfig(completeConfig({ darajaEnabled: false }))).toBeNull();
  });

  it("decrypts the stored secrets", () => {
    const encrypted = buildOwnerPaymentConfigSet(null, {
      daraja: {
        environment: "sandbox",
        consumerKey: "ck",
        consumerSecret: "cs",
        passphrase: "pp",
        shortcode: "174379",
      },
    });
    const resolved = resolveDarajaConfig({
      darajaEnabled: true,
      daraja: encrypted.daraja as Record<string, string>,
    });
    expect(resolved).toEqual({
      environment: "sandbox",
      consumerKey: "ck",
      consumerSecret: "cs",
      passphrase: "pp",
      shortcode: "174379",
    });
  });
});

describe("owner config persistence", () => {
  it("loads a config through the model", async () => {
    configStub.findOne.mockReturnValue(buildQuery(completeConfig()));
    const config = await getOwnerPaymentConfig("owner-1");
    expect(config).toMatchObject({ ownerId: "owner-1" });
    expect(configStub.findOne).toHaveBeenCalledWith({ ownerId: "owner-1" });
  });

  it("returns a masked view", async () => {
    configStub.findOne.mockReturnValue(buildQuery(completeConfig()));
    const view = await getOwnerPaymentConfigView("owner-1");
    expect(view.mpesaConfigured).toBe(true);
    expect(view.daraja.consumerKeyConfigured).toBe(true);
  });

  it("upserts and returns the masked view", async () => {
    configStub.findOne
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(completeConfig()));
    configStub.findOneAndUpdate.mockResolvedValue(completeConfig());

    const view = await saveOwnerPaymentConfig("owner-1", {
      darajaEnabled: true,
      daraja: {
        environment: "sandbox",
        consumerKey: "ck",
        consumerSecret: "cs",
        passphrase: "pp",
        shortcode: "174379",
      },
    });

    expect(configStub.findOneAndUpdate).toHaveBeenCalledWith(
      { ownerId: "owner-1" },
      expect.objectContaining({ $setOnInsert: { ownerId: "owner-1" } }),
      expect.objectContaining({ upsert: true }),
    );
    expect(view.mpesaConfigured).toBe(true);
  });
});
