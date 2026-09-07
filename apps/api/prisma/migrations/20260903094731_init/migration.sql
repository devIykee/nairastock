-- CreateEnum
CREATE TYPE "CustodyMode" AS ENUM ('DEMO_CUSTODIAL', 'SELF_SIGNED');

-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('STABLECOIN', 'STOCK');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'BUY', 'SELL', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "custodyMode" "CustodyMode" NOT NULL DEFAULT 'DEMO_CUSTODIAL',
    "encryptedMnemonic" TEXT,
    "derivationPath" TEXT NOT NULL DEFAULT 'm/44''/60''/0''/0/0',
    "mnemonicBackedUp" BOOLEAN NOT NULL DEFAULT false,
    "isDemoUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "accountIndex" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL DEFAULT 'Main',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TokenKind" NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 18,
    "logoUrl" TEXT,
    "chainlinkFeedAddress" TEXT,
    "underlyingSymbol" TEXT,
    "blurb" TEXT,
    "isTestnetMock" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Balance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '0',
    "syncedAtBlock" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "tokenInId" TEXT,
    "tokenOutId" TEXT,
    "amountIn" TEXT,
    "amountOut" TEXT,
    "minAmountOut" TEXT,
    "txHash" TEXT,
    "chainId" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "gasUsed" TEXT,
    "quotedAmountOut" TEXT,
    "slippageBps" INTEGER,
    "priceUsd" TEXT,
    "priceNgn" TEXT,
    "ngnAmount" TEXT,
    "failureReason" TEXT,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "priceUsd" TEXT NOT NULL,
    "priceNgn" TEXT NOT NULL,
    "ngnUsdRate" TEXT NOT NULL,
    "roundId" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_chainId_key" ON "Wallet"("address", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");

-- CreateIndex
CREATE INDEX "AuthNonce_address_expiresAt_idx" ON "AuthNonce"("address", "expiresAt");

-- CreateIndex
CREATE INDEX "Token_kind_isActive_idx" ON "Token"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Token_symbol_chainId_key" ON "Token"("symbol", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "Token_address_chainId_key" ON "Token"("address", "chainId");

-- CreateIndex
CREATE INDEX "Balance_userId_idx" ON "Balance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Balance_userId_tokenId_key" ON "Balance"("userId", "tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txHash_key" ON "Transaction"("txHash");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_tokenId_timestamp_idx" ON "PriceSnapshot"("tokenId", "timestamp");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthNonce" ADD CONSTRAINT "AuthNonce_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tokenInId_fkey" FOREIGN KEY ("tokenInId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tokenOutId_fkey" FOREIGN KEY ("tokenOutId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;
