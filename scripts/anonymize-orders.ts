// Applies the personal-data retention policy (Settings → retention.orderPiiDays). Schedule daily.
import { prisma } from "../src/server/db";
import { runRetention } from "../src/server/retention";

runRetention()
  .then((r) => console.log(`Обезличено заявок: ${r.anonymized} (срок хранения ${r.days} дн.)`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
