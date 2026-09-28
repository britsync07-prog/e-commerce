create unique index if not exists product_images_shop_product_asset_idx
  on product_images (shop_id, product_id, asset_id);
