# Slim Client to name + attributes JSON; add ClientFieldDefinition schema.

import uuid
from decimal import Decimal

from django.db import migrations, models


# Keys that previously lived as Client columns; values move into attributes.
ATTRIBUTE_KEYS = [
    "contact_name",
    "contact_email",
    "contact_phone",
    "industry",
    "sub_industry",
    "company_size",
    "annual_revenue",
    "employee_count",
    "year_established",
    "address_line_1",
    "address_line_2",
    "city",
    "state_province",
    "postal_code",
    "country",
    "policy_number",
    "broker_name",
    "broker_contact",
    "coverage_type",
    "total_insured_value",
    "risk_rating",
    "previous_claims_count",
    "last_assessment_date",
    "notes",
]


def _json_safe(value):
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def migrate_columns_to_attributes(apps, schema_editor):
    Client = apps.get_model("portfolio", "Client")
    for client in Client.objects.all():
        attributes = {}
        for key in ATTRIBUTE_KEYS:
            value = getattr(client, key, None)
            if value is None:
                continue
            attributes[key] = _json_safe(value)
        client.attributes = attributes
        client.save(update_fields=["attributes"])


def noop_reverse(apps, schema_editor):
    # Old columns are dropped; reverse would need reconstructing columns.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("portfolio", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClientFieldDefinition",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("key", models.SlugField(max_length=100, unique=True)),
                ("label", models.CharField(max_length=255)),
                (
                    "field_type",
                    models.CharField(
                        choices=[
                            ("text", "Text"),
                            ("email", "Email"),
                            ("integer", "Integer"),
                            ("decimal", "Decimal"),
                            ("date", "Date"),
                            ("choice", "Choice"),
                            ("boolean", "Boolean"),
                        ],
                        max_length=20,
                    ),
                ),
                ("required", models.BooleanField(default=False)),
                ("enabled", models.BooleanField(default=True)),
                ("group", models.CharField(blank=True, default="", max_length=100)),
                ("order", models.PositiveIntegerField(default=0)),
                ("choices", models.JSONField(blank=True, null=True)),
                (
                    "help_text",
                    models.CharField(blank=True, default="", max_length=500),
                ),
            ],
            options={
                "ordering": ["group", "order", "key"],
            },
        ),
        migrations.AddField(
            model_name="client",
            name="attributes",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(migrate_columns_to_attributes, noop_reverse),
        migrations.RemoveField(model_name="client", name="address_line_1"),
        migrations.RemoveField(model_name="client", name="address_line_2"),
        migrations.RemoveField(model_name="client", name="annual_revenue"),
        migrations.RemoveField(model_name="client", name="broker_contact"),
        migrations.RemoveField(model_name="client", name="broker_name"),
        migrations.RemoveField(model_name="client", name="city"),
        migrations.RemoveField(model_name="client", name="company_size"),
        migrations.RemoveField(model_name="client", name="contact_email"),
        migrations.RemoveField(model_name="client", name="contact_name"),
        migrations.RemoveField(model_name="client", name="contact_phone"),
        migrations.RemoveField(model_name="client", name="country"),
        migrations.RemoveField(model_name="client", name="coverage_type"),
        migrations.RemoveField(model_name="client", name="employee_count"),
        migrations.RemoveField(model_name="client", name="industry"),
        migrations.RemoveField(model_name="client", name="last_assessment_date"),
        migrations.RemoveField(model_name="client", name="notes"),
        migrations.RemoveField(model_name="client", name="policy_number"),
        migrations.RemoveField(model_name="client", name="postal_code"),
        migrations.RemoveField(model_name="client", name="previous_claims_count"),
        migrations.RemoveField(model_name="client", name="risk_rating"),
        migrations.RemoveField(model_name="client", name="state_province"),
        migrations.RemoveField(model_name="client", name="sub_industry"),
        migrations.RemoveField(model_name="client", name="total_insured_value"),
        migrations.RemoveField(model_name="client", name="year_established"),
    ]
