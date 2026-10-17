// Product pictures for the demo catalog. They are static files in /public/products (see public/products/SOURCES.md for
// where each came from and its license), matched to the product by NAME. A product with no entry here (for example one
// a seller adds by hand) gets a neutral icon for its TYPE, never somebody else's picture.
//
// Only products whose picture is the real product (or a clearly the same model) are listed. The rest intentionally fall
// back to a generic icon: see the notes in SOURCES.md.
const IMAGES = {
  'iPhone 16 128GB': 'iphone-16.jpg',
  'Samsung Galaxy S25': 'samsung-galaxy-s25.jpg',
  'Sony WH-1000XM5': 'sony-wh-1000xm5.jpg',
  'Apple AirPods Pro 2': 'apple-airpods-pro-2.jpg',
  'Apple Watch Series 10': 'apple-watch-series-10.jpg',
  'Logitech MX Master 3S': 'logitech-mx-master-3s.jpg',
  'Mi Smart Band 8': 'xiaomi-mi-smart-band-8.jpg',
}

export const productImageSrc = (name) => (name && IMAGES[name] ? `/products/${IMAGES[name]}` : null)

// The kind of product, guessed from its name, for the generic icon shown when there is no real picture.
const TYPES = [
  ['laptop', /laptop|inspiron|ideapad|macbook|notebook/i],
  ['phone', /iphone|galaxy|phone|pixel/i],
  ['audio', /airdopes|airpods|earbud|buds|headphone|wh-1000/i],
  ['speaker', /flip|speaker|boombox/i],
  ['wearable', /watch|band/i],
  ['mouse', /mouse|mx master/i],
  ['battery', /power ?bank|charger/i],
]
export const productType = (name) => TYPES.find(([, re]) => re.test(name ?? ''))?.[0] ?? 'other'
