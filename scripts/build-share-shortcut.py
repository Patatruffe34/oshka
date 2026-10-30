"""Generate the public iPhone share shortcut. Sign with macOS `shortcuts sign`.

python3 scripts/build-share-shortcut.py /tmp/oshka-unsigned.shortcut
shortcuts sign --mode anyone --input /tmp/oshka-unsigned.shortcut \
  --output public/shortcuts/Ajouter-a-Oshka.shortcut

The instance origin comes from the second argument, else OSHKA_ORIGIN in the
environment or in the root .env.
"""
import os
import plistlib
import sys
import uuid
from pathlib import Path


def env_origin():
    if os.environ.get("OSHKA_ORIGIN"):
        return os.environ["OSHKA_ORIGIN"]
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "OSHKA_ORIGIN":
                return value.strip().strip("\"'")
    return None


origin = sys.argv[2] if len(sys.argv) > 2 else env_origin()
if not origin:
    sys.exit("Missing origin: pass it as second argument or set OSHKA_ORIGIN in .env")
origin = origin.rstrip("/")
prefix = origin + "/share#text="
encoded_id = str(uuid.uuid4()).upper()
text_id = str(uuid.uuid4()).upper()


def attachment(value):
    return {"Value": value, "WFSerializationType": "WFTextTokenAttachment"}


def text_variable(value):
    # URL Encode has a text parameter: a bare attachment is discarded on import.
    return {
        "Value": {"string": "\ufffc", "attachmentsByRange": {"{0, 1}": value}},
        "WFSerializationType": "WFTextTokenString",
    }


shortcut = {
    "WFWorkflowName": "Ajouter à Oshka",
    "WFWorkflowClientVersion": "2600",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 946986751, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowTypes": ["ActionExtension"],
    "WFWorkflowInputContentItemClasses": ["WFURLContentItem", "WFStringContentItem", "WFSafariWebPageContentItem"],
    "WFWorkflowImportQuestions": [],
    "WFWorkflowActions": [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.urlencode",
            "WFWorkflowActionParameters": {
                "WFEncodeMode": "Encode",
                "WFInput": text_variable({"Type": "ExtensionInput"}),
                "UUID": encoded_id,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": text_id,
                "WFTextActionText": {
                    "Value": {
                        "string": prefix + "\ufffc",
                        "attachmentsByRange": {
                            "{" + str(len(prefix)) + ", 1}": {
                                "Type": "ActionOutput", "OutputUUID": encoded_id, "OutputName": "URL Encoded Text",
                            },
                        },
                    },
                    "WFSerializationType": "WFTextTokenString",
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.openurl",
            "WFWorkflowActionParameters": {
                "WFInput": attachment({"Type": "ActionOutput", "OutputUUID": text_id, "OutputName": "Text"}),
            },
        },
    ],
}

with open(sys.argv[1], "wb") as output:
    plistlib.dump(shortcut, output)
