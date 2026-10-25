import { handle } from '../utils/http.js';
import * as productService from '../services/product.service.js';

export const listProducts = handle(async () => ({
  body: { products: await productService.getCatalogProducts() },
}));

export const getProduct = handle(async (req) => ({
  body: { product: await productService.getCatalogProductById(req.params.id) },
}));

