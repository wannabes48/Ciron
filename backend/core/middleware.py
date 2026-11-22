from django.conf import settings


class TenantSubdomainMiddleware:
    """Resolve the tenant subdomain from the Host header (shop.ciron.co.ke -> "shop").

    In local development, where there is no wildcard DNS, the frontend sends an
    ``X-Business`` header instead. The resolved value is only a *hint*: API views
    always scope data to the authenticated user's business and reject requests whose
    subdomain does not match it.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.root = "." + settings.CIRON_ROOT_DOMAIN.lower()

    def __call__(self, request):
        host = request.get_host().split(":")[0].lower()
        slug = None
        if host.endswith(self.root):
            candidate = host[: -len(self.root)]
            if candidate and "." not in candidate and candidate not in ("www", "app", "api"):
                slug = candidate
        request.tenant_slug = slug or (request.headers.get("X-Business") or "").strip().lower() or None
        return self.get_response(request)
