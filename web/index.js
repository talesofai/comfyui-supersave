import { app } from "../../scripts/app.js";
import { $el } from "../../scripts/ui.js";

/**
 * Converts the current graph workflow for sending to the API.
 * Data logic is preserved exactly as requested.
 * @returns The workflow and node links
 */
async function graphToPrompt() {
  for (const outerNode of this.graph.computeExecutionOrder(false)) {
    const innerNodes = outerNode.getInnerNodes ? outerNode.getInnerNodes() : [outerNode];
    for (const node of innerNodes) {
      if (node.isVirtualNode) {
        if (node.applyToGraph) {
          node.applyToGraph();
        }
      }
    }
  }

  const workflow = this.graph.serialize();
  const output = {};
  for (const outerNode of this.graph.computeExecutionOrder(false)) {
    const innerNodes = outerNode.getInnerNodes ? outerNode.getInnerNodes() : [outerNode];
    for (const node of innerNodes) {
      if (node.isVirtualNode || node.mode === 2 || node.mode === 4) {
        continue;
      }

      const inputs = {};
      if (node.widgets) {
        for (const widget of node.widgets) {
          if (!widget.options || widget.options.serialize !== false) {
            inputs[widget.name] = widget.serializeValue ? await widget.serializeValue(node, node.widgets.indexOf(widget)) : widget.value;
          }
        }
      }

      for (let i in node.inputs) {
        let parent = node.getInputNode(i);
        if (parent) {
          let link = node.getInputLink(i);
          while (parent.mode === 4 || parent.isVirtualNode) {
            let found = false;
            if (parent.isVirtualNode) {
              link = parent.getInputLink(link.origin_slot);
              if (link) {
                parent = parent.getInputNode(link.target_slot);
                if (parent) found = true;
              }
            } else if (link && parent.mode === 4) {
              for (let parent_input in parent.inputs) {
                if (parent.inputs[parent_input]?.type === node.inputs[i].type) {
                  link = parent.getInputLink(parent_input);
                  if (link) parent = parent.getInputNode(parent_input);
                  found = true;
                  break;
                }
              }
            }
            if (!found) break;
          }
          if (link) {
            if (parent?.updateLink) link = parent.updateLink(link);
            inputs[node.inputs[i].name] = [String(link.origin_id), parseInt(link.origin_slot)];
          }
        }
      }

      output[String(node.id)] = {
        inputs,
        class_type: node.comfyClass,
        title: node.title,
      };
    }
  }

  for (const o in output) {
    for (const i in output[o].inputs) {
      if (Array.isArray(output[o].inputs[i]) && !output[output[o].inputs[i][0]]) {
        delete output[o].inputs[i];
      }
    }
  }

  workflow.extra = { api: output, inputs: {}, outputs: {} };
  return { workflow, output };
}

/**
 * Creates a file from a string and triggers a download.
 * @param {string} filename The name of the file to download.
 * @param {string} data The file content.
 */
function createAndDownload(filename, data) {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = $el("a", {
    href: url,
    download: filename,
    style: { display: "none" },
    parent: document.body,
  });
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * The main function to trigger the super save export.
 */
async function runSuperExport() {
  const promptFilename = app.ui.settings.getSettingValue("Comfy.PromptFilename", true);
  let filename = "workflow_merged.json";
  if (promptFilename) {
    filename = prompt("Save workflow as:", filename);
    if (!filename) return;
    if (!filename.toLowerCase().endsWith(".json")) {
      filename += ".json";
    }
  }
  const p = await graphToPrompt.bind(app)();
  const json = JSON.stringify(p.workflow, null, 2);
  createAndDownload(filename, json);
}

// Register the extension with the new menu API
app.registerExtension({
  name: "ComfyUI.SuperSave",
  
  // Define the command for our action
  commands: [
    {
      id: 'comfyui.superSave',
      label: 'Export (Super)',
      function: runSuperExport,
    }
  ],
  
  // Add the command to the desired menu path
  menuCommands: [
    {
      // Assuming the path is 'File' -> 'Export (API)'
      // This might need adjustment if the internal IDs are different.
      path: ['File'],
      commands: ['comfyui.superSave']
    }
  ]
});
