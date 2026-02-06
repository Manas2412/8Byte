/**
 * Seeds a test user with a portfolio and one stock for API testing.
 * Run from backend-server:  cd apps/backend-server && bun run seed
 * (The actual script lives in apps/backend-server/scripts/seed-test-user.ts)
 *
 * User: test@example.com / Test@1234
 */
console.log("Run from backend-server: cd apps/backend-server && bun run seed");
process.exit(1);

const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "Test@1234";
const TEST_NAME = "Test User";
const STOCK_SYMBOL = "TCS";
const STOCK_NAME = "Tata Consultancy Services";
const EXCHANGE = "NSE";
const PURCHASED_PRICE = 3500;
const PURCHASED_QTY = 10;
const INVESTMENT = PURCHASED_PRICE * PURCHASED_QTY;

async function main() {
  const hashed = await bcrypt.hash(TEST_PASSWORD, 10);

  const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (existing) {
    console.log("Test user already exists:", existing.id);
    const portfolio = await prisma.portfolio.findUnique({
      where: { userId: existing.id },
      include: { stocks: true },
    });
    if (portfolio) {
      console.log("Portfolio exists with", portfolio.stocks.length, "stock(s).");
    } else {
      const port = await prisma.portfolio.create({
        data: { userId: existing.id },
      });
      await prisma.stock.create({
        data: {
          symbol: STOCK_SYMBOL,
          name: STOCK_NAME,
          exchange: EXCHANGE,
          purchasedPrice: PURCHASED_PRICE,
          purchasedAt: new Date(),
          purchasedQuantity: PURCHASED_QTY,
          investment: INVESTMENT,
          portfolioId: port.id,
        },
      });
      console.log("Created portfolio and stock for existing user.");
    }
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      password: hashed,
      name: TEST_NAME,
    },
  });

  const portfolio = await prisma.portfolio.create({
    data: { userId: user.id },
  });

  await prisma.stock.create({
    data: {
      symbol: STOCK_SYMBOL,
      name: STOCK_NAME,
      exchange: EXCHANGE,
      purchasedPrice: PURCHASED_PRICE,
      purchasedAt: new Date(),
      purchasedQuantity: PURCHASED_QTY,
      investment: INVESTMENT,
      portfolioId: portfolio.id,
    },
  });

  console.log("Created test user:", user.id, user.email);
  console.log("Portfolio and 1 stock (TCS, NSE) created. Sign in with:", TEST_EMAIL, "/", TEST_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
