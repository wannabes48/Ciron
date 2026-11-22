from django.contrib import admin

from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["username", "full_name", "business", "role", "is_active", "last_login"]
    list_filter = ["role", "is_active", "business"]
    search_fields = ["username", "full_name", "email", "phone"]
    exclude = ["password", "pos_pin"]
