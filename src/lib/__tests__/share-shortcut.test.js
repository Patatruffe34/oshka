import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const generated = () => JSON.parse(execFileSync("python3", ["-c", `
import json, plistlib, subprocess, tempfile
from pathlib import Path
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / 'share.shortcut'
    subprocess.run(['python3', 'scripts/build-share-shortcut.py', str(path), 'https://oshka.test'], check=True)
    print(json.dumps(plistlib.loads(path.read_bytes())))
`], { cwd: new URL("../../..", import.meta.url), encoding: "utf8" }));

describe("iPhone shortcut export", () => {
  it("supplies Shortcut Input as a text token string to URL Encode, the format accepted by Apple's importer", () => {
    const actions = generated().WFWorkflowActions;
    const encode = actions.find((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.urlencode");
    expect(encode.WFWorkflowActionParameters.WFInput).toEqual({
      WFSerializationType: "WFTextTokenString",
      Value: { string: "\ufffc", attachmentsByRange: { "{0, 1}": { Type: "ExtensionInput" } } },
    });
    const text = actions.find((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.gettext");
    const refs = Object.values(text.WFWorkflowActionParameters.WFTextActionText.Value.attachmentsByRange);
    expect(refs[0].OutputUUID).toBe(encode.WFWorkflowActionParameters.UUID);
  });
});
