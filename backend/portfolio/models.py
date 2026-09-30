import uuid
from django.db import models


# Default schema mirroring the original Client columns (pre-attributes).
# Seed and settings UIs can load these when no custom definitions exist.
DEFAULT_CLIENT_FIELD_DEFINITIONS = [
    # Contact
    {
        "key": "contact_name",
        "label": "Contact Name",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "contact",
        "order": 1,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "contact_email",
        "label": "Contact Email",
        "field_type": "email",
        "required": True,
        "enabled": True,
        "group": "contact",
        "order": 2,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "contact_phone",
        "label": "Contact Phone",
        "field_type": "text",
        "required": False,
        "enabled": True,
        "group": "contact",
        "order": 3,
        "choices": None,
        "help_text": "",
    },
    # Company
    {
        "key": "industry",
        "label": "Industry",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "company",
        "order": 1,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "sub_industry",
        "label": "Sub-Industry",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "company",
        "order": 2,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "company_size",
        "label": "Company Size",
        "field_type": "choice",
        "required": True,
        "enabled": True,
        "group": "company",
        "order": 3,
        "choices": [
            {"value": "small", "label": "Small (1-50)"},
            {"value": "medium", "label": "Medium (51-250)"},
            {"value": "large", "label": "Large (251-1000)"},
            {"value": "enterprise", "label": "Enterprise (1000+)"},
        ],
        "help_text": "",
    },
    {
        "key": "annual_revenue",
        "label": "Annual Revenue",
        "field_type": "decimal",
        "required": True,
        "enabled": True,
        "group": "company",
        "order": 4,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "employee_count",
        "label": "Employee Count",
        "field_type": "integer",
        "required": True,
        "enabled": True,
        "group": "company",
        "order": 5,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "year_established",
        "label": "Year Established",
        "field_type": "integer",
        "required": True,
        "enabled": True,
        "group": "company",
        "order": 6,
        "choices": None,
        "help_text": "",
    },
    # Location
    {
        "key": "address_line_1",
        "label": "Address Line 1",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "location",
        "order": 1,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "address_line_2",
        "label": "Address Line 2",
        "field_type": "text",
        "required": False,
        "enabled": True,
        "group": "location",
        "order": 2,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "city",
        "label": "City",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "location",
        "order": 3,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "state_province",
        "label": "State / Province",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "location",
        "order": 4,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "postal_code",
        "label": "Postal Code",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "location",
        "order": 5,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "country",
        "label": "Country",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "location",
        "order": 6,
        "choices": None,
        "help_text": "",
    },
    # Insurance
    {
        "key": "policy_number",
        "label": "Policy Number",
        "field_type": "text",
        "required": False,
        "enabled": True,
        "group": "insurance",
        "order": 1,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "broker_name",
        "label": "Broker Name",
        "field_type": "text",
        "required": False,
        "enabled": True,
        "group": "insurance",
        "order": 2,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "broker_contact",
        "label": "Broker Contact",
        "field_type": "text",
        "required": False,
        "enabled": True,
        "group": "insurance",
        "order": 3,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "coverage_type",
        "label": "Coverage Type",
        "field_type": "text",
        "required": True,
        "enabled": True,
        "group": "insurance",
        "order": 4,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "total_insured_value",
        "label": "Total Insured Value",
        "field_type": "decimal",
        "required": False,
        "enabled": True,
        "group": "insurance",
        "order": 5,
        "choices": None,
        "help_text": "",
    },
    # Risk
    {
        "key": "risk_rating",
        "label": "Risk Rating",
        "field_type": "choice",
        "required": False,
        "enabled": True,
        "group": "risk",
        "order": 1,
        "choices": [
            {"value": "low", "label": "Low"},
            {"value": "medium", "label": "Medium"},
            {"value": "high", "label": "High"},
            {"value": "critical", "label": "Critical"},
        ],
        "help_text": "",
    },
    {
        "key": "previous_claims_count",
        "label": "Previous Claims Count",
        "field_type": "integer",
        "required": False,
        "enabled": True,
        "group": "risk",
        "order": 2,
        "choices": None,
        "help_text": "",
    },
    {
        "key": "last_assessment_date",
        "label": "Last Assessment Date",
        "field_type": "date",
        "required": False,
        "enabled": True,
        "group": "risk",
        "order": 3,
        "choices": None,
        "help_text": "",
    },
    # Notes
    {
        "key": "notes",
        "label": "Notes",
        "field_type": "text",
        "required": False,
        "enabled": True,
        "group": "notes",
        "order": 1,
        "choices": None,
        "help_text": "",
    },
]


class ClientFieldDefinition(models.Model):
    """
    Schema for a customisable client attribute. End users edit definitions
    in-app; values live on Client.attributes keyed by this model's key.
    """

    FIELD_TYPES = [
        ("text", "Text"),
        ("email", "Email"),
        ("integer", "Integer"),
        ("decimal", "Decimal"),
        ("date", "Date"),
        ("choice", "Choice"),
        ("boolean", "Boolean"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.SlugField(max_length=100, unique=True)
    label = models.CharField(max_length=255)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    required = models.BooleanField(default=False)
    enabled = models.BooleanField(default=True)
    group = models.CharField(max_length=100, blank=True, default="")
    order = models.PositiveIntegerField(default=0)
    choices = models.JSONField(null=True, blank=True)
    help_text = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        ordering = ["group", "order", "key"]

    def __str__(self):
        return f"{self.label} ({self.key})"


class Client(models.Model):
    """
    A client in the portfolio. Each client represents an insured entity
    that Nettle conducts risk assessments for.

    Customisable fields (contact, company, location, insurance, risk, notes)
    are stored in attributes, keyed by ClientFieldDefinition.key.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    attributes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
