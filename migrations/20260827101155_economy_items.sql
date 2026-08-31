CREATE TABLE IF NOT EXISTS economy_categories
(
    id            UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    guild_id      BIGINT       NOT NULL,
    name          VARCHAR(100) NOT NULL,
    description   TEXT         NOT NULL DEFAULT '',
    position      INT          NOT NULL DEFAULT 0,
    emoji_unicode VARCHAR(32)           DEFAULT NULL,
    emoji_id      VARCHAR(64)           DEFAULT NULL,

    -- Multi-tenant composite unique key for cross-table foreign key references
    CONSTRAINT uq_economy_categories_guild_id UNIQUE (guild_id, id),
    -- Prevent duplicate category names within the same guild
    CONSTRAINT uq_economy_categories_guild_name UNIQUE (guild_id, name),
    -- Value domain checks
    CONSTRAINT chk_economy_categories_name_not_empty CHECK (char_length(trim(name)) >= 1),
    CONSTRAINT chk_economy_categories_position_non_negative CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS idx_economy_categories_guild ON economy_categories (guild_id);

CREATE TABLE IF NOT EXISTS economy_items
(
    id              UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    guild_id        BIGINT       NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    price           BIGINT       NOT NULL DEFAULT 0,
    category_id     UUID                  DEFAULT NULL,
    emoji_unicode   VARCHAR(32)           DEFAULT NULL,
    emoji_id        VARCHAR(64)           DEFAULT NULL,
    is_inventory    BOOL         NOT NULL DEFAULT TRUE,
    is_usable       BOOL         NOT NULL DEFAULT TRUE,
    is_sellable     BOOL         NOT NULL DEFAULT TRUE,
    is_listed       BOOL         NOT NULL DEFAULT TRUE,
    unlimited_stock BOOL         NOT NULL DEFAULT TRUE,
    stock_remaining INT          NOT NULL DEFAULT 0,
    requirements    JSONB        NOT NULL DEFAULT '[]'::JSONB,
    actions         JSONB        NOT NULL DEFAULT '[]'::JSONB,
    expires_at      TIMESTAMPTZ           DEFAULT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Composite unique key to ensure inventory rows reference the same guild's item
    CONSTRAINT uq_economy_items_guild_id UNIQUE (guild_id, id),
    -- Multi-tenant FK: Ensures the category belongs to the SAME guild as the item
    CONSTRAINT fk_economy_items_category FOREIGN KEY (guild_id, category_id)
        REFERENCES economy_categories (guild_id, id) ON DELETE SET NULL,
    -- Prevent duplicate item names within the same guild
    CONSTRAINT uq_economy_items_guild_name UNIQUE (guild_id, name),
    -- Value domain checks
    CONSTRAINT chk_economy_items_name_not_empty CHECK (char_length(trim(name)) >= 1),
    CONSTRAINT chk_economy_items_price_non_negative CHECK (price >= 0),
    CONSTRAINT chk_economy_items_stock_non_negative CHECK (stock_remaining >= 0),
    -- JSONB structure checks (must always be JSON arrays)
    CONSTRAINT chk_economy_items_requirements_is_array CHECK (jsonb_typeof(requirements) = 'array'),
    CONSTRAINT chk_economy_items_actions_is_array CHECK (jsonb_typeof(actions) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_economy_items_guild ON economy_items (guild_id);
CREATE INDEX IF NOT EXISTS idx_economy_items_category ON economy_items (category_id);

CREATE TABLE IF NOT EXISTS economy_inventory
(
    guild_id BIGINT NOT NULL,
    user_id  BIGINT NOT NULL,
    item_id  UUID   NOT NULL,
    quantity INT    NOT NULL DEFAULT 1,

    PRIMARY KEY (guild_id, user_id, item_id),
    -- Multi-tenant FK: Guarantees user inventory cannot reference an item from a different guild
    CONSTRAINT fk_economy_inventory_item FOREIGN KEY (guild_id, item_id)
        REFERENCES economy_items (guild_id, id) ON DELETE CASCADE,
    -- Inventory cannot hold 0 or negative items (0-quantity rows should be deleted)
    CONSTRAINT chk_economy_inventory_quantity_positive CHECK (quantity > 0)
);