from rest_framework import serializers

from .models import AuditLog, Branch, ContactMessage, Notification


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "name", "code", "location", "phone", "is_main", "is_warehouse", "is_active"]


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.__str__", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ["id", "user", "user_name", "action", "object_type", "object_id", "details", "ip_address", "created_at"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "level", "title", "message", "link", "is_read", "created_at"]
        read_only_fields = ["kind", "level", "title", "message", "link", "created_at"]


class ContactMessageSerializer(serializers.ModelSerializer):
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = ContactMessage
        fields = ["name", "business_name", "phone", "email", "topic", "message", "website"]

    def validate(self, attrs):
        if not attrs.get("phone") and not attrs.get("email"):
            raise serializers.ValidationError("Give us a phone number or an email address so we can reply.")
        return attrs
