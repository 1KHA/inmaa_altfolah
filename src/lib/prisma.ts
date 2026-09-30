import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Determine database type from environment
const isDevelopment = process.env.NODE_ENV === 'development'
const databaseType = process.env.DATABASE_TYPE || (isDevelopment ? 'sqlite' : 'postgresql')

// Log environment variables for debugging
console.log(`[Prisma] NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`[Prisma] DATABASE_TYPE: ${databaseType}`)
console.log(`[Prisma] DATABASE_URL exists: ${!!process.env.DATABASE_URL}`)

// Configure logging based on environment
const logOptions: Prisma.LogLevel[] = isDevelopment 
  ? ['query', 'error', 'warn'] as Prisma.LogLevel[]
  : ['error'] as Prisma.LogLevel[]

// Enhanced Prisma client configuration for multi-database support
// The datasource override is applied ONLY when the URL is actually present.
// `next build` imports every route module to read its config exports, and on
// Vercel DATABASE_URL is not necessarily exposed to the build step — passing
// `url: undefined` makes the PrismaClient constructor throw during "Collecting
// page data". Without the override Prisma resolves env("DATABASE_URL") from the
// schema lazily, i.e. at query time, when the variable is there.
const clientOptions: Prisma.PrismaClientOptions = { log: logOptions }
if (process.env.DATABASE_URL) {
  clientOptions.datasources = { db: { url: process.env.DATABASE_URL } }
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient(clientOptions)

// Log database connection information in development
if (isDevelopment) {
  console.log(`[Prisma] Using ${databaseType} database`)
}

// Store Prisma client in global object in development
if (isDevelopment) globalForPrisma.prisma = prisma

// Gracefully handle disconnection
process.on('beforeExit', async () => {
  try {
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error disconnecting Prisma:', error)
  }
})

// Handle build-time database connection issues
process.on('SIGINT', async () => {
  try {
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error disconnecting Prisma on SIGINT:', error)
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  try {
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error disconnecting Prisma on SIGTERM:', error)
  }
  process.exit(0)
})
