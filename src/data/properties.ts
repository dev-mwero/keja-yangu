import p1 from "@/assets/property-1.jpg";
import p2 from "@/assets/property-2.jpg";
import p3 from "@/assets/property-3.jpg";
import p4 from "@/assets/property-4.jpg";
import p5 from "@/assets/property-5.jpg";
import p6 from "@/assets/property-6.jpg";

const imageUrl = (image: string | { src: string }) =>
  typeof image === "string" ? image : image.src;

export type PropertyType = "room" | "apartment" | "building";
export type PropertyStatus = "available" | "occupied" | "maintenance";

export interface Property {
  id: string;
  title: string;
  type: PropertyType;
  location: string;
  price: number;
  description: string;
  images: string[];
  amenities: string[];
  status: PropertyStatus;
  ownerId: string;
  caretakerIds: string[];
  beds: number;
  baths: number;
  area: number;
}

export const properties: Property[] = [
  {
    id: "p1",
    title: "Sunlit Studio in Kilimani",
    type: "apartment",
    location: "Kilimani, Nairobi",
    price: 45000,
    description:
      "An airy studio bathed in golden light, finished with warm oak floors and curated minimalist furniture. Steps from cafés and the Yaya Centre.",
    images: [imageUrl(p1), imageUrl(p2), imageUrl(p4)],
    amenities: ["Wi-Fi", "Parking", "Backup Water", "Security 24/7", "Gym"],
    status: "available",
    ownerId: "o1",
    caretakerIds: ["c1"],
    beds: 1,
    baths: 1,
    area: 42,
  },
  {
    id: "p2",
    title: "Terracotta Loft, Westlands",
    type: "apartment",
    location: "Westlands, Nairobi",
    price: 78000,
    description:
      "A warm one-bedroom loft with a view of the city skyline. Designer touches throughout, with a private balcony for slow mornings.",
    images: [imageUrl(p2), imageUrl(p1), imageUrl(p6)],
    amenities: ["Balcony", "Lift", "Wi-Fi", "Backup Power", "Pool"],
    status: "available",
    ownerId: "o1",
    caretakerIds: ["c1", "c2"],
    beds: 1,
    baths: 1,
    area: 65,
  },
  {
    id: "p3",
    title: "Palmera Residences",
    type: "building",
    location: "Nyali, Mombasa",
    price: 120000,
    description:
      "A coastal residence with palm-lined balconies, sea breeze, and walking distance to the beach. Limestone facade and spacious layouts.",
    images: [imageUrl(p3), imageUrl(p4), imageUrl(p1)],
    amenities: ["Pool", "Gym", "Garden", "Security", "CCTV", "Beach Access"],
    status: "occupied",
    ownerId: "o1",
    caretakerIds: ["c2"],
    beds: 3,
    baths: 2,
    area: 145,
  },
  {
    id: "p4",
    title: "Skyline Penthouse",
    type: "apartment",
    location: "Upper Hill, Nairobi",
    price: 220000,
    description:
      "Floor-to-ceiling windows wrap a serene living room with panoramic city views. Designed for those who appreciate scale and light.",
    images: [imageUrl(p4), imageUrl(p2), imageUrl(p6)],
    amenities: ["Concierge", "Pool", "Gym", "Lift", "Smart Home", "Parking"],
    status: "available",
    ownerId: "o1",
    caretakerIds: ["c1"],
    beds: 4,
    baths: 3,
    area: 280,
  },
  {
    id: "p5",
    title: "Cedar Cabin Room",
    type: "room",
    location: "Karen, Nairobi",
    price: 18000,
    description:
      "A cozy single room clad in warm cedar, surrounded by greenery. A retreat for students or remote workers.",
    images: [imageUrl(p5), imageUrl(p1)],
    amenities: ["Wi-Fi", "Shared Kitchen", "Garden", "Quiet Zone"],
    status: "available",
    ownerId: "o1",
    caretakerIds: ["c2"],
    beds: 1,
    baths: 1,
    area: 18,
  },
  {
    id: "p6",
    title: "Amber Heights",
    type: "building",
    location: "Lavington, Nairobi",
    price: 95000,
    description:
      "A glowing residential block with generous balconies, communal gardens, and a thoughtful concierge service.",
    images: [imageUrl(p6), imageUrl(p3), imageUrl(p4)],
    amenities: ["Concierge", "Lift", "Parking", "Gym", "Backup Power"],
    status: "maintenance",
    ownerId: "o1",
    caretakerIds: ["c1", "c2"],
    beds: 2,
    baths: 2,
    area: 95,
  },
];

export interface Tenant {
  id: string;
  name: string;
  email: string;
  propertyId?: string;
  status: "active" | "pending" | "rejected";
  joined: string;
}

export const tenants: Tenant[] = [
  { id: "t1", name: "Amina Otieno", email: "amina@kj.co", propertyId: "p3", status: "active", joined: "2024-08-12" },
  { id: "t2", name: "Brian Kamau", email: "brian@kj.co", propertyId: "p2", status: "pending", joined: "2025-02-01" },
  { id: "t3", name: "Cynthia Wairimu", email: "cyn@kj.co", propertyId: "p1", status: "active", joined: "2024-11-22" },
  { id: "t4", name: "Daniel Mwangi", email: "dan@kj.co", status: "pending", joined: "2025-03-08" },
  { id: "t5", name: "Esther Njeri", email: "esther@kj.co", propertyId: "p4", status: "rejected", joined: "2025-01-19" },
];

export interface Caretaker {
  id: string;
  name: string;
  email: string;
  properties: string[];
}

export const caretakers: Caretaker[] = [
  { id: "c1", name: "John Kiprono", email: "john@kj.co", properties: ["p1", "p2", "p4", "p6"] },
  { id: "c2", name: "Mercy Atieno", email: "mercy@kj.co", properties: ["p3", "p5", "p6"] },
];
