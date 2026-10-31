import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });

/**
 * Backfills legacy flat `Unit.serviceCharge` values into itemized service fees.
 * Creates one "Service charge" template item per property and a per-unit
 * override for units whose legacy amount differs from the template default.
 *
 * Idempotent: re-running matches the item by `{ propertyId, label }` and
 * upserts overrides by `{ itemId, unitId }`. Run with `--dry-run` to preview.
 */

const unitSchema = new mongoose.Schema(
  {
    propertyId: { type: String, default: "" },
    ownerId: { type: String, default: "" },
    serviceCharge: { type: Number, default: 0 },
    rentIncludesServiceCharge: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: "units" },
);

const itemSchema = new mongoose.Schema(
  {
    ownerId: { type: String, default: "" },
    propertyId: { type: String, default: "" },
    label: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    appliesTo: { type: String, default: "all" },
    unitIds: { type: [String], default: [] },
  },
  { collection: "servicefeeitems", timestamps: true },
);

const overrideSchema = new mongoose.Schema(
  {
    ownerId: { type: String, default: "" },
    propertyId: { type: String, default: "" },
    itemId: { type: String, default: "" },
    unitId: { type: String, default: "" },
    amount: { type: Number, default: null },
    active: { type: Boolean, default: null },
  },
  { collection: "unitservicefeeoverrides", timestamps: true },
);

const UNIT_LABEL = "Service charge";

function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

function modeAmount(amounts: number[]): number {
  const counts = new Map<number, number>();
  for (const amount of amounts) counts.set(amount, (counts.get(amount) ?? 0) + 1);
  let best = amounts[0] ?? 0;
  let bestCount = 0;
  for (const [amount, count] of counts) {
    if (count > bestCount || (count === bestCount && amount > best)) {
      best = amount;
      bestCount = count;
    }
  }
  return best;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  });

  const Unit = mongoose.models.Unit || mongoose.model("Unit", unitSchema);
  const ServiceFeeItem =
    mongoose.models.ServiceFeeItem || mongoose.model("ServiceFeeItem", itemSchema);
  const UnitServiceFeeOverride =
    mongoose.models.UnitServiceFeeOverride ||
    mongoose.model("UnitServiceFeeOverride", overrideSchema);

  const dryRun = isDryRun();
  const units = await Unit.find({ deletedAt: null, serviceCharge: { $gt: 0 } })
    .select("_id propertyId ownerId serviceCharge rentIncludesServiceCharge")
    .lean();

  const byProperty = new Map<string, typeof units>();
  for (const unit of units) {
    const key = String(unit.propertyId);
    const group = byProperty.get(key);
    if (group) group.push(unit);
    else byProperty.set(key, [unit]);
  }

  let createdItems = 0;
  let createdOverrides = 0;
  let removedOverrides = 0;
  let inclusiveUnits = 0;

  for (const [propertyId, propertyUnits] of byProperty) {
    const amounts = propertyUnits.map((unit) => Math.max(0, Math.round(unit.serviceCharge ?? 0)));
    const defaultAmount = modeAmount(amounts);
    const ownerId = String(propertyUnits[0]?.ownerId ?? "");

    let item = await ServiceFeeItem.findOne({ propertyId, label: UNIT_LABEL }).lean();
    if (!item) {
      if (!dryRun) {
        const created = await ServiceFeeItem.create({
          ownerId,
          propertyId,
          label: UNIT_LABEL,
          amount: defaultAmount,
          active: true,
          sortOrder: 0,
          appliesTo: "selected",
          unitIds: [],
        });
        item = created.toObject();
      }
      createdItems += 1;
    }

    const itemId = item?._id ? String(item._id) : "";
    const itemAmount = item?.amount ?? defaultAmount;

    if (!dryRun && itemId) {
      const existingIds = new Set<string>((item?.unitIds ?? []).map(String));
      for (const unit of propertyUnits) existingIds.add(String(unit._id));
      await ServiceFeeItem.updateOne(
        { _id: itemId },
        { $set: { unitIds: [...existingIds] } },
      );
    }

    for (const [index, unit] of propertyUnits.entries()) {
      if (unit.rentIncludesServiceCharge) inclusiveUnits += 1;
      const amount = amounts[index];
      if (!itemId) continue;

      if (amount === itemAmount) {
        if (!dryRun) {
          const result = await UnitServiceFeeOverride.deleteOne({
            itemId,
            unitId: String(unit._id),
          });
          if (result.deletedCount) removedOverrides += 1;
        }
        continue;
      }

      if (!dryRun) {
        await UnitServiceFeeOverride.findOneAndUpdate(
          { itemId, unitId: String(unit._id) },
          {
            $set: {
              ownerId: String(unit.ownerId ?? ownerId),
              propertyId,
              itemId,
              unitId: String(unit._id),
              amount,
              active: true,
            },
          },
          { upsert: true, runValidators: true },
        );
      }
      createdOverrides += 1;
    }
  }

  console.log(`${dryRun ? "[dry-run] " : ""}Scanned ${units.length} legacy service-charge unit(s).`);
  console.log(`Created ${createdItems} template item(s).`);
  console.log(`Created/updated ${createdOverrides} unit override(s).`);
  console.log(`Removed ${removedOverrides} redundant override(s).`);
  console.log(
    `Flagged ${inclusiveUnits} inclusive-rent unit(s); they keep the legacy split until lease renewal.`,
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
