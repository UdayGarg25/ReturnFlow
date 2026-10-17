# Demo product pictures

Static pictures for the demo catalog, matched to the product by name in `src/utils/productImages.js`.
They were resized to at most 560 px on the long side, cropped where noted, and saved as JPEG (white background) for the web.

| Product | File | Source | License | Author | Changes |
|---|---|---|---|---|---|
| iPhone 16 128GB | `iphone-16.jpg` | https://commons.wikimedia.org/wiki/File:Back_view_of_iPhone_16_Ultramarine.jpg | CC BY-SA 4.0 | メイド理世 | cropped to the phone, resized |
| Samsung Galaxy S25 | `samsung-galaxy-s25.jpg` | https://commons.wikimedia.org/wiki/File:Galaxy_S25_Black.png | CC BY-SA 4.0 | Mandy Harper | flattened onto white, resized |
| Sony WH-1000XM5 | `sony-wh-1000xm5.jpg` | the project's own file `backend/assets/demo-products/sony-wh1000xm5.png` (the same image stored in the private S3 bucket as the warehouse reference image) | project asset | n/a | converted to JPEG, resized |
| Apple AirPods Pro 2 | `apple-airpods-pro-2.jpg` | https://commons.wikimedia.org/wiki/File:AirPods_Pro_2.jpg | CC BY-SA 4.0 | aconcagua | resized |
| Apple Watch Series 10 | `apple-watch-series-10.jpg` | https://commons.wikimedia.org/wiki/File:Apple_Watch_Series_10.png | Public domain | KK IN HK | cropped to the black watch, resized |
| Logitech MX Master 3S | `logitech-mx-master-3s.jpg` | https://commons.wikimedia.org/wiki/File:Logitech_MX_Master_3S_HS12.jpg | CC BY 4.0 | Hayden Schiff | resized |
| Mi Smart Band 8 | `xiaomi-mi-smart-band-8.jpg` | https://commons.wikimedia.org/wiki/File:Xiaomi_Mi_Band_8.jpg (the Xiaomi Smart Band 8, sold in India as Mi Smart Band 8) | CC BY-SA 4.0 | DeadJacb | cropped to the band, resized |

CC BY / CC BY-SA require attribution (above); CC BY-SA also requires that adapted copies be shared under the same license.
These pictures are real photographs or renders of the product, not catalog photography; several are hand-held store photos.

## Products WITHOUT a picture (generic icon shown instead)

No suitable freely licensed picture of the exact model could be found, and a picture of a different model would be misleading, so these show a neutral icon for the product type:

- Dell Inspiron 14 (only unrelated or older Inspiron models on Wikimedia Commons)
- Lenovo IdeaPad Slim 5 (nothing found)
- JBL Flip 6 (only Flip 3 and Flip 4)
- Anker 737 Power Bank (nothing found)
- boAt Airdopes 141 (nothing found)

To add one later: put a picture in this folder and add its name to `IMAGES` in `src/utils/productImages.js`.
