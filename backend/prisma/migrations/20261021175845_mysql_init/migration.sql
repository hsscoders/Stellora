-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(24) NOT NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `role` ENUM('CUSTOMER', 'ADMIN') NOT NULL DEFAULT 'CUSTOMER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `loyaltyPoints` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `useraddresses` (
    `id` CHAR(24) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `line1` VARCHAR(191) NOT NULL,
    `line2` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `pincode` VARCHAR(16) NOT NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'India',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `useraddresses_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wishlistitems` (
    `id` CHAR(24) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `productId` CHAR(24) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wishlistitems_userId_productId_idx`(`userId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` CHAR(24) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_tokenHash_key`(`tokenHash`),
    INDEX `sessions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `passwordresettokens` (
    `id` CHAR(24) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `passwordresettokens_tokenHash_key`(`tokenHash`),
    INDEX `passwordresettokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(24) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `imageUrl` VARCHAR(500) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(24) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `categoryId` CHAR(24) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shortDescription` TEXT NOT NULL,
    `description` TEXT NULL,
    `materials` TEXT NULL,
    `careInstructions` TEXT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isNewArrival` BOOLEAN NOT NULL DEFAULT false,
    `isBestSeller` BOOLEAN NOT NULL DEFAULT false,
    `isTrending` BOOLEAN NOT NULL DEFAULT false,
    `videoUrl` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `products_slug_key`(`slug`),
    INDEX `products_categoryId_status_idx`(`categoryId`, `status`),
    INDEX `products_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productvariants` (
    `id` CHAR(24) NOT NULL,
    `productId` CHAR(24) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `barcode` VARCHAR(64) NULL,
    `name` VARCHAR(191) NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `compareAtPrice` DECIMAL(12, 2) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `lowStockThreshold` INTEGER NOT NULL DEFAULT 5,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `productvariants_productId_idx`(`productId`),
    INDEX `productvariants_barcode_idx`(`barcode`),
    INDEX `productvariants_sku_idx`(`sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productimages` (
    `id` CHAR(24) NOT NULL,
    `productId` CHAR(24) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `alt` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `productimages_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stockmovements` (
    `id` CHAR(24) NOT NULL,
    `variantId` CHAR(24) NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` ENUM('INITIAL', 'PURCHASE', 'ORDER_COMMIT', 'ORDER_RELEASE', 'MANUAL_ADJUST') NOT NULL,
    `reference` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdById` CHAR(24) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stockmovements_variantId_createdAt_idx`(`variantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carts` (
    `id` CHAR(24) NOT NULL,
    `userId` CHAR(24) NULL,
    `sessionKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `carts_userId_key`(`userId`),
    UNIQUE INDEX `carts_sessionKey_key`(`sessionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cartitems` (
    `id` CHAR(24) NOT NULL,
    `cartId` CHAR(24) NOT NULL,
    `variantId` CHAR(24) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cartitems_cartId_idx`(`cartId`),
    INDEX `cartitems_variantId_idx`(`variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` CHAR(24) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` TEXT NULL,
    `discountType` ENUM('PERCENT', 'FIXED') NOT NULL,
    `value` DECIMAL(12, 2) NOT NULL,
    `minSubtotal` DECIMAL(12, 2) NULL,
    `maxDiscount` DECIMAL(12, 2) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `usageLimit` INTEGER NULL,
    `perUserLimit` INTEGER NULL,
    `timesUsed` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `couponredemptions` (
    `id` CHAR(24) NOT NULL,
    `couponId` CHAR(24) NOT NULL,
    `orderId` CHAR(24) NOT NULL,
    `userId` CHAR(24) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `couponredemptions_couponId_idx`(`couponId`),
    INDEX `couponredemptions_userId_idx`(`userId`),
    INDEX `couponredemptions_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(24) NOT NULL,
    `orderNumber` VARCHAR(32) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `paymentStatus` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `paymentMethod` ENUM('PAY_ON_CONFIRMATION', 'GATEWAY') NOT NULL DEFAULT 'PAY_ON_CONFIRMATION',
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `discountTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shippingFee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'INR',
    `couponCode` VARCHAR(64) NULL,
    `pointsRedeemed` INTEGER NOT NULL DEFAULT 0,
    `pointsEarned` INTEGER NOT NULL DEFAULT 0,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `shipName` VARCHAR(191) NOT NULL,
    `shipPhone` VARCHAR(32) NOT NULL,
    `shipLine1` VARCHAR(191) NOT NULL,
    `shipLine2` VARCHAR(191) NULL,
    `shipCity` VARCHAR(191) NOT NULL,
    `shipState` VARCHAR(191) NOT NULL,
    `shipPincode` VARCHAR(16) NOT NULL,
    `shipCountry` VARCHAR(191) NOT NULL DEFAULT 'India',
    `cancelledReason` TEXT NULL,
    `adminNote` TEXT NULL,
    `source` ENUM('ONLINE', 'POS') NOT NULL DEFAULT 'ONLINE',
    `paymentIntentProvider` ENUM('razorpay', 'stripe', 'demo') NULL,
    `paymentIntentGatewayOrderId` VARCHAR(191) NULL,
    `paymentIntentCreatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `orders_orderNumber_key`(`orderNumber`),
    UNIQUE INDEX `orders_idempotencyKey_key`(`idempotencyKey`),
    INDEX `orders_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `orders_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `orders_paymentStatus_idx`(`paymentStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orderitems` (
    `id` CHAR(24) NOT NULL,
    `orderId` CHAR(24) NOT NULL,
    `productId` CHAR(24) NULL,
    `variantId` CHAR(24) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `variantName` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(500) NULL,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `lineTotal` DECIMAL(12, 2) NOT NULL,

    INDEX `orderitems_orderId_idx`(`orderId`),
    INDEX `orderitems_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orderevents` (
    `id` CHAR(24) NOT NULL,
    `orderId` CHAR(24) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED') NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `orderevents_orderId_createdAt_idx`(`orderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orderpayments` (
    `id` CHAR(24) NOT NULL,
    `orderId` CHAR(24) NOT NULL,
    `method` ENUM('PAY_ON_CONFIRMATION', 'GATEWAY') NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `amount` DECIMAL(12, 2) NOT NULL,
    `providerRef` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `orderpayments_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordershipments` (
    `id` CHAR(24) NOT NULL,
    `orderId` CHAR(24) NOT NULL,
    `carrier` VARCHAR(191) NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SHIPPED', 'DELIVERED') NOT NULL DEFAULT 'PENDING',
    `shippedAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,

    UNIQUE INDEX `ordershipments_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shippingrates` (
    `id` CHAR(24) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `baseFee` DECIMAL(12, 2) NOT NULL,
    `freeAbove` DECIMAL(12, 2) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` CHAR(24) NOT NULL,
    `productId` CHAR(24) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `authorName` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL DEFAULT '',
    `body` TEXT NOT NULL,
    `isVerifiedPurchase` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reviews_productId_status_createdAt_idx`(`productId`, `status`, `createdAt`),
    UNIQUE INDEX `reviews_productId_userId_key`(`productId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `newslettersubscribers` (
    `id` CHAR(24) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `source` VARCHAR(64) NOT NULL DEFAULT 'footer',
    `unsubscribedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `newslettersubscribers_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `restockalerts` (
    `id` CHAR(24) NOT NULL,
    `productId` CHAR(24) NOT NULL,
    `variantId` CHAR(24) NULL,
    `email` VARCHAR(191) NOT NULL,
    `notifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `restockalerts_productId_email_key`(`productId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `returnrequests` (
    `id` CHAR(24) NOT NULL,
    `orderNumber` VARCHAR(32) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `type` ENUM('RETURN', 'EXCHANGE') NOT NULL,
    `reason` TEXT NOT NULL,
    `details` TEXT NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'REQUESTED',
    `adminNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `returnrequests_orderNumber_idx`(`orderNumber`),
    INDEX `returnrequests_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `returnitems` (
    `id` CHAR(24) NOT NULL,
    `returnRequestId` CHAR(24) NOT NULL,
    `orderItemId` VARCHAR(64) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `variantName` VARCHAR(191) NOT NULL DEFAULT '',
    `quantity` INTEGER NOT NULL,

    INDEX `returnitems_returnRequestId_idx`(`returnRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productquestions` (
    `id` CHAR(24) NOT NULL,
    `productId` CHAR(24) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `authorName` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NULL,
    `answeredAt` DATETIME(3) NULL,
    `answeredById` CHAR(24) NULL,
    `status` ENUM('PENDING', 'ANSWERED', 'HIDDEN') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `productquestions_productId_status_createdAt_idx`(`productId`, `status`, `createdAt`),
    INDEX `productquestions_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `loyaltyledger` (
    `id` CHAR(24) NOT NULL,
    `userId` CHAR(24) NOT NULL,
    `orderId` CHAR(24) NULL,
    `delta` INTEGER NOT NULL,
    `reason` ENUM('EARN', 'REDEEM', 'REFUND_EARN', 'REFUND_REDEEM', 'ADJUST') NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `loyaltyledger_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `loyaltyledger_orderId_reason_idx`(`orderId`, `reason`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `homepagebanners` (
    `id` CHAR(24) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `subtitle` TEXT NULL,
    `imageUrl` VARCHAR(500) NOT NULL,
    `ctaLabel` VARCHAR(191) NULL,
    `ctaHref` VARCHAR(500) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sitesettings` (
    `id` CHAR(24) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sitesettings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contactmessages` (
    `id` CHAR(24) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `email` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `status` ENUM('NEW', 'HANDLED') NOT NULL DEFAULT 'NEW',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditlogs` (
    `id` CHAR(24) NOT NULL,
    `actorId` CHAR(24) NULL,
    `actorEmail` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(64) NOT NULL,
    `entityId` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `auditlogs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `auditlogs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhookevents` (
    `id` CHAR(24) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `webhookevents_eventId_key`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashsessions` (
    `id` CHAR(24) NOT NULL,
    `terminalId` VARCHAR(16) NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `openedById` CHAR(24) NULL,
    `openedByName` VARCHAR(120) NULL,
    `openingBalance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `openingNote` VARCHAR(300) NULL,
    `countedBalance` DECIMAL(12, 2) NULL,
    `expectedCash` DECIMAL(12, 2) NULL,
    `cashSales` DECIMAL(12, 2) NULL,
    `variance` DECIMAL(12, 2) NULL,
    `closingNote` VARCHAR(300) NULL,
    `openedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cashsessions_terminalId_status_idx`(`terminalId`, `status`),
    INDEX `cashsessions_status_idx`(`status`),
    INDEX `cashsessions_openedAt_idx`(`openedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatthreads` (
    `id` CHAR(24) NOT NULL,
    `customerId` CHAR(24) NULL,
    `guestKey` VARCHAR(64) NULL,
    `displayName` VARCHAR(120) NOT NULL,
    `contactHint` VARCHAR(191) NULL,
    `lastMessagePreview` VARCHAR(140) NOT NULL DEFAULT '',
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unreadForAdmin` INTEGER NOT NULL DEFAULT 0,
    `unreadForCustomer` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `closedAt` DATETIME(3) NULL,
    `closedByName` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chatthreads_customerId_idx`(`customerId`),
    INDEX `chatthreads_guestKey_idx`(`guestKey`),
    INDEX `chatthreads_lastMessageAt_idx`(`lastMessageAt`),
    INDEX `chatthreads_status_unreadForAdmin_idx`(`status`, `unreadForAdmin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatmessages` (
    `id` CHAR(24) NOT NULL,
    `threadId` CHAR(24) NOT NULL,
    `senderRole` ENUM('CUSTOMER', 'ADMIN') NOT NULL,
    `senderId` CHAR(24) NULL,
    `senderName` VARCHAR(120) NOT NULL DEFAULT '',
    `body` VARCHAR(2000) NOT NULL,
    `clientMsgId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chatmessages_threadId_createdAt_idx`(`threadId`, `createdAt`),
    INDEX `chatmessages_clientMsgId_idx`(`clientMsgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
