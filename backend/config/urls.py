from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from accounts import views as accounts
from catalog import views as catalog
from core import views as core
from crm import views as crm
from expenses import views as expenses
from inventory import views as inventory
from purchasing import views as purchasing
from reports import views as reports
from sales import views as sales

router = DefaultRouter()
router.register("users", accounts.UserViewSet, basename="user")
router.register("shifts", accounts.ShiftViewSet, basename="shift")
router.register("login-history", accounts.LoginHistoryViewSet, basename="login-history")
router.register("branches", core.BranchViewSet, basename="branch")
router.register("audit-logs", core.AuditLogViewSet, basename="audit-log")
router.register("notifications", core.NotificationViewSet, basename="notification")
router.register("categories", catalog.CategoryViewSet, basename="category")
router.register("brands", catalog.BrandViewSet, basename="brand")
router.register("units", catalog.UnitViewSet, basename="unit")
router.register("products", catalog.ProductViewSet, basename="product")
router.register("customer-prices", catalog.CustomerPriceViewSet, basename="customer-price")
router.register("stock/movements", inventory.StockMovementViewSet, basename="stock-movement")
router.register("stock/batches", inventory.StockBatchViewSet, basename="stock-batch")
router.register("stock/adjustments", inventory.StockAdjustmentViewSet, basename="stock-adjustment")
router.register("stock/transfers", inventory.StockTransferViewSet, basename="stock-transfer")
router.register("stock/stocktakes", inventory.StocktakeViewSet, basename="stocktake")
router.register("stock/insights", inventory.InventoryInsightsViewSet, basename="stock-insights")
router.register("customers", crm.CustomerViewSet, basename="customer")
router.register("suppliers", crm.SupplierViewSet, basename="supplier")
router.register("sales", sales.SaleViewSet, basename="sale")
router.register("payments", sales.PaymentViewSet, basename="payment")
router.register("returns", sales.SaleReturnViewSet, basename="return")
router.register("purchase-orders", purchasing.PurchaseOrderViewSet, basename="purchase-order")
router.register("expense-categories", expenses.ExpenseCategoryViewSet, basename="expense-category")
router.register("expenses", expenses.ExpenseViewSet, basename="expense")

api = [
    path("auth/register/", accounts.RegisterBusinessView.as_view()),
    path("auth/login/", accounts.LoginView.as_view()),
    path("auth/logout/", accounts.LogoutView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", accounts.MeView.as_view()),
    path("auth/roles/", accounts.RolesView.as_view()),
    path("settings/", core.BusinessSettingsView.as_view()),
    path("public/contact/", core.ContactMessageView.as_view()),
    path("reports/dashboard/", reports.DashboardView.as_view()),
    path("reports/sales/", reports.SalesReportView.as_view()),
    path("reports/profit-loss/", reports.ProfitLossView.as_view()),
    path("reports/inventory/", reports.InventoryReportView.as_view()),
    path("reports/cashiers/", reports.CashierReconciliationView.as_view()),
    path("", include(router.urls)),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
