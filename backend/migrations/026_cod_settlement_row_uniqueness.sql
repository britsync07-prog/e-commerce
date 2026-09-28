create unique index if not exists cod_settlement_rows_external_ref_idx
  on cod_settlement_rows (shop_id, settlement_id, external_ref);
