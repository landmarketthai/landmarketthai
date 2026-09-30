-- Marketplace V2 P1 compatibility fixes for legacy text constraints.
-- The original schema uses text + CHECK constraints rather than enums.

alter table lands drop constraint if exists lands_land_type_check;
alter table lands add constraint lands_land_type_check
  check (land_type in ('land', 'industrial', 'eec', 'factory', 'warehouse', 'logistics', 'data_center', 'investment'));

alter table lands drop constraint if exists lands_status_check;
alter table lands add constraint lands_status_check
  check (status in ('draft', 'active', 'reserved', 'sold', 'archived', 'expired'));
