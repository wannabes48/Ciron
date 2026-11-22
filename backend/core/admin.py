from django.contrib import admin

from .models import AuditLog, Branch, Business, ContactMessage


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ["name", "subdomain", "business_type", "phone", "is_active", "created_at"]
    list_filter = ["is_active", "business_type"]
    search_fields = ["name", "subdomain", "phone", "kra_pin"]


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ["name", "business", "is_main", "is_active"]
    list_filter = ["business"]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "business", "user", "action", "object_type", "object_id"]
    list_filter = ["business", "action"]


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("created_at", "name", "business_name", "phone", "email", "topic", "handled")
    list_filter = ("topic", "handled")
    search_fields = ("name", "business_name", "phone", "email", "message")
    list_editable = ("handled",)
