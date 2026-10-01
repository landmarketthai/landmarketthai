-- LandmarketThai is a sale-only marketplace.
-- Keep legacy rent_price_monthly columns for backward-compatible schema history,
-- but prevent any new rental transaction from entering marketplace tables.

update property_submissions
set transaction_type = 'sale', updated_at = now()
where status = 'draft' and transaction_type is null;

alter table lands
  alter column transaction_type set default 'sale';
alter table property_submissions
  alter column transaction_type set default 'sale';
alter table buyer_requirements
  alter column transaction_type set default 'sale';

alter table lands drop constraint if exists lands_transaction_type_check;
alter table lands add constraint lands_transaction_type_check
  check (transaction_type = 'sale');

alter table property_submissions drop constraint if exists property_submissions_transaction_type_check;
alter table property_submissions add constraint property_submissions_transaction_type_check
  check (transaction_type is null or transaction_type = 'sale');

alter table buyer_requirements drop constraint if exists buyer_requirements_transaction_type_check;
alter table buyer_requirements add constraint buyer_requirements_transaction_type_check
  check (transaction_type = 'sale');
