-- The starting grant used to be recorded by the wallet existing, so a wallet that another
-- member's transfer created skipped the grant when its owner first touched the economy.
-- The flag tracks the grant itself, so it can be applied exactly once.
--
-- Existing wallets are marked as granted: they were all created by the grant path, and
-- marking them otherwise would hand every member a second starting balance.
ALTER TABLE economy_balances
    ADD COLUMN starting_grant_applied BOOLEAN NOT NULL DEFAULT TRUE;

-- New wallets are created by paths that do not grant the starting balance, such as an
-- incoming transfer, so they start unmarked.
ALTER TABLE economy_balances
    ALTER COLUMN starting_grant_applied SET DEFAULT FALSE;
