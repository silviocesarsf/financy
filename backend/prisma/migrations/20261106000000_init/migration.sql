-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(180) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `monthlyIncome` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `payday` INTEGER NOT NULL DEFAULT 5,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `color` VARCHAR(9) NOT NULL,
    `icon` VARCHAR(40) NOT NULL,
    `type` ENUM('EXPENSE', 'INCOME') NOT NULL DEFAULT 'EXPENSE',
    `keywords` VARCHAR(1000) NOT NULL DEFAULT '',
    `monthlyBudget` DECIMAL(12, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `categories_userId_name_type_key`(`userId`, `name`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transactions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `type` ENUM('EXPENSE', 'INCOME') NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `date` DATE NOT NULL,
    `paymentMethod` ENUM('CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `source` ENUM('MANUAL', 'NUBANK_CARD_CSV', 'NUBANK_ACCOUNT_CSV', 'NUBANK_PDF', 'OFX', 'RECURRING') NOT NULL DEFAULT 'MANUAL',
    `installmentNumber` INTEGER NULL,
    `installmentTotal` INTEGER NULL,
    `notes` VARCHAR(500) NULL,
    `fingerprint` VARCHAR(80) NULL,
    `importBatchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `transactions_userId_date_idx`(`userId`, `date`),
    INDEX `transactions_userId_type_date_idx`(`userId`, `type`, `date`),
    INDEX `transactions_userId_categoryId_date_idx`(`userId`, `categoryId`, `date`),
    INDEX `transactions_importBatchId_idx`(`importBatchId`),
    UNIQUE INDEX `transactions_userId_fingerprint_key`(`userId`, `fingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurrings` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `type` ENUM('EXPENSE', 'INCOME') NOT NULL DEFAULT 'EXPENSE',
    `description` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `dayOfMonth` INTEGER NOT NULL,
    `paymentMethod` ENUM('CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `recurrings_userId_active_idx`(`userId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_batches` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `source` ENUM('MANUAL', 'NUBANK_CARD_CSV', 'NUBANK_ACCOUNT_CSV', 'NUBANK_PDF', 'OFX', 'RECURRING') NOT NULL,
    `totalItems` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `import_batches_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goals` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `targetAmount` DECIMAL(12, 2) NOT NULL,
    `currentAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `deadline` DATE NULL,
    `color` VARCHAR(9) NOT NULL DEFAULT '#10b981',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `goals_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_importBatchId_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `import_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurrings` ADD CONSTRAINT `recurrings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurrings` ADD CONSTRAINT `recurrings_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goals` ADD CONSTRAINT `goals_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

