from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Client, ClientFieldDefinition


def _is_empty(value) -> bool:
    return value is None or value == ""


def _choice_values(definition: ClientFieldDefinition) -> set:
    raw = definition.choices or []
    values = set()
    for item in raw:
        if isinstance(item, dict) and "value" in item:
            values.add(item["value"])
        else:
            values.add(item)
    return values


def _validate_attribute_type(
    definition: ClientFieldDefinition, value
) -> None:
    """Raise serializers.ValidationError if value does not match field_type."""
    field_type = definition.field_type
    label = definition.label

    if field_type == "text":
        if not isinstance(value, str):
            raise serializers.ValidationError(
                f"{label} must be a string."
            )
    elif field_type == "email":
        if not isinstance(value, str):
            raise serializers.ValidationError(
                f"{label} must be a string."
            )
        try:
            validate_email(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                f"{label} must be a valid email address."
            ) from exc
    elif field_type == "integer":
        # bool is a subclass of int in Python — reject it explicitly.
        if isinstance(value, bool) or not isinstance(value, int):
            raise serializers.ValidationError(
                f"{label} must be an integer."
            )
    elif field_type == "decimal":
        if isinstance(value, bool):
            raise serializers.ValidationError(
                f"{label} must be a decimal number."
            )
        if isinstance(value, (int, float, Decimal)):
            return
        if isinstance(value, str):
            try:
                Decimal(value)
            except InvalidOperation as exc:
                raise serializers.ValidationError(
                    f"{label} must be a decimal number."
                ) from exc
            return
        raise serializers.ValidationError(
            f"{label} must be a decimal number."
        )
    elif field_type == "date":
        if isinstance(value, date) and not isinstance(value, datetime):
            return
        if not isinstance(value, str):
            raise serializers.ValidationError(
                f"{label} must be a date string (YYYY-MM-DD)."
            )
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise serializers.ValidationError(
                f"{label} must be a date string (YYYY-MM-DD)."
            ) from exc
    elif field_type == "boolean":
        if not isinstance(value, bool):
            raise serializers.ValidationError(
                f"{label} must be a boolean."
            )
    elif field_type == "choice":
        allowed = _choice_values(definition)
        if value not in allowed:
            raise serializers.ValidationError(
                f"{label} must be one of: {', '.join(str(v) for v in sorted(allowed, key=str))}."
            )


def validate_client_attributes(
    attributes: dict,
    *,
    partial: bool = False,
    submitted_keys: set[str] | None = None,
) -> dict:
    """
    Validate attributes against enabled ClientFieldDefinition rows.

    - Rejects unknown keys among *submitted_keys* (defaults to all keys in
      attributes). Existing orphaned keys from deleted definitions are kept
      and ignored when submitted_keys is a subset (typical PATCH merge).
    - Enforces required fields (skipped when partial=True and key omitted).
    - Checks basic type / choice constraints for provided non-empty values.
    """
    if not isinstance(attributes, dict):
        raise serializers.ValidationError("Attributes must be an object.")

    definitions = list(
        ClientFieldDefinition.objects.filter(enabled=True)
    )
    by_key = {d.key: d for d in definitions}
    errors: dict[str, list[str]] = {}

    keys_to_check = (
        submitted_keys if submitted_keys is not None else set(attributes.keys())
    )
    unknown = keys_to_check - set(by_key.keys())
    if unknown:
        errors["non_field_errors"] = [
            f"Unknown attribute key(s): {', '.join(sorted(unknown))}."
        ]

    for definition in definitions:
        key = definition.key
        if key not in attributes:
            if definition.required and not partial:
                errors.setdefault(key, []).append(
                    f"{definition.label} is required."
                )
            continue

        value = attributes[key]
        if _is_empty(value):
            if definition.required:
                errors.setdefault(key, []).append(
                    f"{definition.label} is required."
                )
            continue

        try:
            _validate_attribute_type(definition, value)
        except serializers.ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, list):
                errors.setdefault(key, []).extend(str(d) for d in detail)
            else:
                errors.setdefault(key, []).append(str(detail))

    if errors:
        raise serializers.ValidationError(errors)

    return attributes


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "name", "attributes", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_attributes(self, value):
        if value is None:
            value = {}
        # Create: validate here so field errors nest under "attributes".
        # Update: defer to validate() after merging with existing attributes.
        if self.instance is None:
            return validate_client_attributes(value, partial=False)
        return value

    def validate(self, attrs):
        incoming = attrs.get("attributes", serializers.empty)
        if self.instance is None:
            # Ensure attributes defaults to {} when omitted on create.
            if incoming is serializers.empty:
                try:
                    attrs["attributes"] = validate_client_attributes(
                        {}, partial=False
                    )
                except serializers.ValidationError as exc:
                    raise serializers.ValidationError(
                        {"attributes": exc.detail}
                    ) from exc
            return attrs

        if incoming is serializers.empty:
            return attrs

        # Merge with existing attributes so PATCH can send a subset of keys.
        # Only reject unknown keys from the request payload so orphaned keys
        # left after a definition destroy do not block updates.
        merged = {**(self.instance.attributes or {}), **incoming}
        try:
            attrs["attributes"] = validate_client_attributes(
                merged,
                partial=False,
                submitted_keys=set(incoming.keys()),
            )
        except serializers.ValidationError as exc:
            raise serializers.ValidationError(
                {"attributes": exc.detail}
            ) from exc
        return attrs


class ClientListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views."""

    class Meta:
        model = Client
        fields = ["id", "name", "attributes", "created_at"]


class ClientFieldDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientFieldDefinition
        fields = [
            "id",
            "key",
            "label",
            "field_type",
            "required",
            "enabled",
            "group",
            "order",
            "choices",
            "help_text",
        ]
        read_only_fields = ["id"]

    def validate_key(self, value):
        if self.instance is not None and value != self.instance.key:
            raise serializers.ValidationError(
                "The key cannot be changed after creation."
            )
        return value

    def validate(self, attrs):
        field_type = attrs.get(
            "field_type",
            getattr(self.instance, "field_type", None),
        )
        choices = attrs.get(
            "choices",
            getattr(self.instance, "choices", None) if self.instance else None,
        )

        if field_type == "choice":
            if not choices:
                raise serializers.ValidationError(
                    {"choices": "Choice fields require a non-empty choices list."}
                )
            if not isinstance(choices, list):
                raise serializers.ValidationError(
                    {"choices": "Choices must be a list."}
                )
            for item in choices:
                if isinstance(item, dict):
                    if "value" not in item:
                        raise serializers.ValidationError(
                            {
                                "choices": (
                                    "Each choice object must include a 'value' key."
                                )
                            }
                        )
                elif not isinstance(item, (str, int, float, bool)):
                    raise serializers.ValidationError(
                        {
                            "choices": (
                                "Choices must be strings/numbers or "
                                "{value, label} objects."
                            )
                        }
                    )
        elif "choices" in attrs and attrs["choices"] is not None:
            # Non-choice fields should not carry choices.
            attrs["choices"] = None

        return attrs

    def update(self, instance, validated_data):
        # Belt-and-suspenders: never persist a key change.
        validated_data.pop("key", None)
        return super().update(instance, validated_data)
