// Creates or updates a staff account. The password is read from ADMIN_PASSWORD or prompted (hidden).
//   npm run admin:create -- --email admin@salamat.kz --name "Имя" --role SUPER_ADMIN [--role OPERATOR]
import { createInterface } from "node:readline";
import { prisma } from "../src/server/db";
import { hashPassword, passwordProblems } from "../src/server/auth/password";
import { ROLE_CODES, type Role } from "../src/server/auth/permissions";

function arg(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => {
    if (s.includes(question)) out.output.write(s);
  };
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); }));
}

async function main() {
  const email = arg("email")[0]?.trim().toLowerCase();
  const name = arg("name")[0] || "Сотрудник";
  const roles = (arg("role").length ? arg("role") : ["SUPER_ADMIN"]) as Role[];
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Укажите --email");
  for (const r of roles) if (!ROLE_CODES.includes(r)) throw new Error(`Неизвестная роль ${r}. Доступны: ${ROLE_CODES.join(", ")}`);
  const password = process.env.ADMIN_PASSWORD || (await askHidden("Пароль (не короче 10 символов, буквы и цифры): "));
  const problem = passwordProblems(password);
  if (problem) throw new Error(problem);
  const roleRows = await prisma.role.findMany({ where: { code: { in: roles } } });
  if (roleRows.length !== roles.length) throw new Error("Роли не найдены — выполните npm run db:seed");
  const user = await prisma.adminUser.upsert({
    where: { email },
    create: { email, name, passwordHash: await hashPassword(password) },
    update: { name, passwordHash: await hashPassword(password), isActive: true, failedLoginCount: 0, lockedUntil: null },
  });
  await prisma.adminUserRole.deleteMany({ where: { adminUserId: user.id } });
  await prisma.adminUserRole.createMany({ data: roleRows.map((r) => ({ adminUserId: user.id, roleId: r.id })) });
  await prisma.auditLog.create({ data: { action: "staff.cli_upsert", entityType: "AdminUser", entityId: user.id, summary: `CLI: ${email} (${roles.join(", ")})` } });
  console.log(`Готово: ${email} — ${roles.join(", ")}`);
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
