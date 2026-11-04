/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeAnnouncement, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Announcement", () => ({ Announcement: getModelStubs().announcement }));

import { DELETE } from "@/app/api/v1/announcements/[id]/route";

const { user, property, announcement } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const OTHER_OWNER_ID = makeObjectId("owner2");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");
const ANNOUNCEMENT_ID = makeObjectId("announcement");

function ownerUser() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerUser() {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: ["manage_announcements"] as never,
  });
}

function url() {
  return `/api/v1/announcements/${ANNOUNCEMENT_ID}`;
}

describe("DELETE /api/v1/announcements/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
    announcement.deleteOne.mockResolvedValue({ deletedCount: 1 });
  });

  it("401 when unauthenticated", async () => {
    const res = await DELETE(
      buildRequest(url(), { method: "DELETE" }),
      withParams(ANNOUNCEMENT_ID),
    );
    expect(res.status).toBe(401);
  });

  it("400 for a malformed id", async () => {
    const res = await DELETE(
      buildRequest("/api/v1/announcements/short", {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams("short"),
    );
    expect(res.status).toBe(400);
  });

  it("404 when the announcement does not exist", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    announcement.findById.mockReturnValue(buildQuery(null));

    const res = await DELETE(
      buildRequest(url(), { method: "DELETE", token: signToken(OWNER_ID) }),
      withParams(ANNOUNCEMENT_ID),
    );
    expect(res.status).toBe(404);
  });

  it("lets an owner delete their own announcement", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    announcement.findById.mockReturnValue(
      buildQuery(makeAnnouncement({ _id: ANNOUNCEMENT_ID, ownerId: OWNER_ID, propertyId: "" })),
    );

    const res = await DELETE(
      buildRequest(url(), { method: "DELETE", token: signToken(OWNER_ID) }),
      withParams(ANNOUNCEMENT_ID),
    );

    expect(res.status).toBe(200);
    expect(announcement.deleteOne).toHaveBeenCalledWith({
      _id: ANNOUNCEMENT_ID,
      ownerId: OWNER_ID,
    });
  });

  it("forbids an owner from deleting another owner's announcement", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    announcement.findById.mockReturnValue(
      buildQuery(makeAnnouncement({ _id: ANNOUNCEMENT_ID, ownerId: OTHER_OWNER_ID })),
    );

    const res = await DELETE(
      buildRequest(url(), { method: "DELETE", token: signToken(OWNER_ID) }),
      withParams(ANNOUNCEMENT_ID),
    );

    expect(res.status).toBe(403);
    expect(announcement.deleteOne).not.toHaveBeenCalled();
  });

  it("lets a caretaker delete an announcement they authored for their managed owner", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser()));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    announcement.findById.mockReturnValue(
      buildQuery(
        makeAnnouncement({
          _id: ANNOUNCEMENT_ID,
          ownerId: OWNER_ID,
          authorId: CARETAKER_ID,
          propertyId: PROPERTY_ID,
        }),
      ),
    );

    const res = await DELETE(
      buildRequest(url(), { method: "DELETE", token: signToken(CARETAKER_ID) }),
      withParams(ANNOUNCEMENT_ID),
    );

    expect(res.status).toBe(200);
    expect(announcement.deleteOne).toHaveBeenCalledWith({
      _id: ANNOUNCEMENT_ID,
      ownerId: OWNER_ID,
    });
  });

  it("forbids a caretaker from deleting an announcement the owner authored", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser()));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    announcement.findById.mockReturnValue(
      buildQuery(
        makeAnnouncement({
          _id: ANNOUNCEMENT_ID,
          ownerId: OWNER_ID,
          authorId: OWNER_ID,
          propertyId: PROPERTY_ID,
        }),
      ),
    );

    const res = await DELETE(
      buildRequest(url(), { method: "DELETE", token: signToken(CARETAKER_ID) }),
      withParams(ANNOUNCEMENT_ID),
    );

    expect(res.status).toBe(403);
    expect(announcement.deleteOne).not.toHaveBeenCalled();
  });

  it("forbids a caretaker from deleting an announcement outside their properties", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser()));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    announcement.findById.mockReturnValue(
      buildQuery(
        makeAnnouncement({
          _id: ANNOUNCEMENT_ID,
          ownerId: OWNER_ID,
          authorId: CARETAKER_ID,
          propertyId: OTHER_PROPERTY_ID,
        }),
      ),
    );

    const res = await DELETE(
      buildRequest(url(), { method: "DELETE", token: signToken(CARETAKER_ID) }),
      withParams(ANNOUNCEMENT_ID),
    );

    expect(res.status).toBe(403);
    expect(announcement.deleteOne).not.toHaveBeenCalled();
  });
});
