import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const create = vi.fn().mockResolvedValue({});
  const push = vi.fn();
  const toast = vi.fn();
  return {
    create,
    push,
    toast,
    unitDetails: [] as unknown[],
    useProperty: vi.fn(),
    useApplications: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "prop-1" }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  usePathname: () => "/properties/prop-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  default: () => <div aria-hidden="true" />,
}));
vi.mock("@/components/SiteHeader", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/PropertyMap", () => ({ PropertyMap: () => <div /> }));
vi.mock("@/components/property/PropertyLightbox", () => ({ PropertyLightbox: () => null }));
vi.mock("@/hooks/use-properties", () => ({ useProperty: mocks.useProperty }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "tenant", name: "Amina", email: "amina@keja.co" },
    loading: false,
  }),
}));
vi.mock("@/hooks/use-applications", () => ({
  useApplications: mocks.useApplications,
  useApplicationMutations: () => ({ create: mocks.create, pending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import PropertyDetails from "@/app/properties/[id]/page";

const PROPERTY = {
  _id: "prop-1",
  title: "Sunset Villa",
  type: "apartment",
  location: "Kilimani",
  price: 45000,
  description: "A sunny apartment",
  images: [],
  amenities: [],
  status: "available",
  ownerId: "o1",
  caretakerIds: [],
  beds: 2,
  baths: 1,
  area: 60,
  published: true,
  blocks: [],
};

const UNITS = [
  {
    _id: "unit-1",
    name: "3A",
    letter: "A",
    floorLevel: 3,
    floorLabel: "3",
    blockName: "D",
    rent: 45000,
    beds: 2,
    baths: 1,
    area: 60,
    status: "available",
  },
];

describe("Property details page", () => {
  beforeEach(() => {
    mocks.create.mockClear();
    mocks.push.mockClear();
    mocks.unitDetails = UNITS;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("unit-summary")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                totalUnits: 1,
                byStatus: { available: 1, occupied: 0, maintenance: 0 },
                floors: [],
              },
            }),
          };
        }
        if (url.includes("includeUnits=all")) {
          return { ok: true, json: async () => ({ data: { units: mocks.unitDetails } }) };
        }
        return { ok: true, json: async () => ({ data: { viewed: true } }) };
      }),
    );
    mocks.useApplications.mockReturnValue({ applications: [], loading: false, refetch: vi.fn() });
    mocks.useProperty.mockReturnValue({
      property: { ...PROPERTY, units: UNITS },
      units: UNITS,
      loading: false,
      error: null,
    });
  });

  it("loads available unit details only when expanded", async () => {
    render(<PropertyDetails />);
    expect(screen.getByText("Units")).toBeInTheDocument();
    expect(screen.queryByText("Unit 3A")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText(/View and request a specific unit/i));
    expect(await screen.findByText("Unit 3A")).toBeInTheDocument();
    expect(screen.getAllByText(/45,000/).length).toBeGreaterThan(0);
  });

  it("opens a unit-scoped dialog and submits the unitId", async () => {
    render(<PropertyDetails />);

    await userEvent.click(screen.getByText(/View and request a specific unit/i));
    await userEvent.click(screen.getByRole("button", { name: /request 3a/i }));

    expect(await screen.findByText("Request 3A · Sunset Villa")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ propertyId: "prop-1", unitId: "unit-1" }),
      );
    });
  });

  it("falls back to a general request when no units are listed", async () => {
    mocks.unitDetails = [];
    mocks.useProperty.mockReturnValue({
      property: { ...PROPERTY, units: [] },
      units: [],
      loading: false,
      error: null,
    });
    render(<PropertyDetails />);
    await userEvent.click(screen.getByText(/View and request a specific unit/i));
    expect(await screen.findByText(/No units are listed right now/i)).toBeInTheDocument();
  });
});
