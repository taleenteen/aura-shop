import {
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from "@tanstack/react-router";
import { RootLayout } from "./root-layout";
import { LandingPage } from "@/features/landing/landing-page";
import { CatalogPage } from "@/features/catalog/catalog-page";
import { ProductDetailPage } from "@/features/configurator/product-detail-page";
import { CheckoutPage } from "@/features/checkout/checkout-page";
import { OrderReceiptPage } from "@/features/checkout/order-receipt-page";
import { AdminLayout } from "@/features/admin/admin-layout";
import { WishlistPage } from "@/features/wishlist/wishlist-page";
import { AccountPage } from "@/features/account/account-page";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/catalog",
  component: CatalogPage,
});

function ProductDetailWrapper() {
  const { slug } = useParams({ from: productDetailRoute.id });
  return <ProductDetailPage slug={slug} />;
}

const productDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products/$slug",
  component: ProductDetailWrapper,
});

const checkoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/checkout",
  component: CheckoutPage,
});

const wishlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wishlist",
  component: WishlistPage,
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  component: AccountPage,
});

function OrderReceiptWrapper() {
  const { orderNumber } = useParams({ from: orderReceiptRoute.id });
  return <OrderReceiptPage orderNumber={orderNumber} />;
}

const orderReceiptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders/$orderNumber",
  component: OrderReceiptWrapper,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminLayout,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  catalogRoute,
  wishlistRoute,
  accountRoute,
  productDetailRoute,
  checkoutRoute,
  orderReceiptRoute,
  adminRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
