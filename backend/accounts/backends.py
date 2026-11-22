from django.contrib.auth.backends import ModelBackend

from .models import User


class TenantUsernameBackend(ModelBackend):
    """Authenticate with (business subdomain, username, password).

    ``business=None`` authenticates platform-level users (super admins / Django admin).
    """

    def authenticate(self, request, username=None, password=None, business=None, **kwargs):
        if username is None or password is None:
            return None
        qs = User.objects.select_related("business")
        if business:
            qs = qs.filter(business__subdomain=business, business__is_active=True)
        else:
            qs = qs.filter(business__isnull=True)
        try:
            user = qs.get(username__iexact=username)
        except User.DoesNotExist:
            User().set_password(password)  # mitigate timing attacks
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
