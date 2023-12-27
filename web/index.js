import { app } from "../../scripts/app.js";
import { $el } from "../../scripts/ui.js";

/**
 * Converts the current graph workflow for sending to the API
 * @returns The workflow and node links
 */
async function graphToPrompt() {
  for (const outerNode of this.graph.computeExecutionOrder(false)) {
    const innerNodes = outerNode.getInnerNodes ? outerNode.getInnerNodes() : [outerNode];
    for (const node of innerNodes) {
      if (node.isVirtualNode) {
        // Don't serialize frontend only nodes but let them make changes
        if (node.applyToGraph) {
          node.applyToGraph();
        }
      }
    }
  }

  const workflow = this.graph.serialize();
  const output = {};
  // Process nodes in order of execution
  for (const outerNode of this.graph.computeExecutionOrder(false)) {
    const innerNodes = outerNode.getInnerNodes ? outerNode.getInnerNodes() : [outerNode];
    for (const node of innerNodes) {
      if (node.isVirtualNode) {
        continue;
      }

      if (node.mode === 2 || node.mode === 4) {
        // Don't serialize muted nodes
        continue;
      }

      const inputs = {};
      const widgets = node.widgets;

      // Store all widget values
      if (widgets) {
        for (const i in widgets) {
          const widget = widgets[i];
          if (!widget.options || widget.options.serialize !== false) {
            inputs[widget.name] = widget.serializeValue ? await widget.serializeValue(node, i) : widget.value;
          }
        }
      }

      // Store all node links
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
                if (parent) {
                  found = true;
                }
              }
            } else if (link && parent.mode === 4) {
              let all_inputs = [link.origin_slot];
              if (parent.inputs) {
                all_inputs = all_inputs.concat(Object.keys(parent.inputs))
                for (let parent_input in all_inputs) {
                  parent_input = all_inputs[parent_input];
                  if (parent.inputs[parent_input]?.type === node.inputs[i].type) {
                    link = parent.getInputLink(parent_input);
                    if (link) {
                      parent = parent.getInputNode(parent_input);
                    }
                    found = true;
                    break;
                  }
                }
              }
            }

            if (!found) {
              break;
            }
          }

          if (link) {
            if (parent?.updateLink) {
              link = parent.updateLink(link);
            }
            inputs[node.inputs[i].name] = [String(link.origin_id), parseInt(link.origin_slot)];
          }
        }
      }

      output[String(node.id)] = {
        inputs,
        class_type: node.comfyClass,
        title: node.title,
      };
      // workflow.nodes.find(n => n.id == node.id).output_data = output[String(node.id)];
    }
  }

  // Remove inputs connected to removed nodes

  for (const o in output) {
    for (const i in output[o].inputs) {
      if (Array.isArray(output[o].inputs[i])
        && output[o].inputs[i].length === 2
        && !output[output[o].inputs[i][0]]) {
        delete output[o].inputs[i];
      }
    }
  }

  workflow.extra = {
    api: output,
    inputs: {},
    outputs: {},
  };

  return { workflow, output };
}

app.registerExtension({
  name: "ComfyUI.SuperSave",
  init() {
  },
  async setup() {
    const promptFilename = app.ui.settings.getSettingValue(
      "Comfy.PromptFilename",
      true,
		);
    app.ui.menuContainer.appendChild(
      $el("button", {
        id: "comfyui-supersave-button",
        textContent: "Super Save",
        onclick: () => {
          let filename = "workflow_merged.json";
          if (promptFilename) {
            filename = prompt("Save workflow as:", filename);
            if (!filename) return;
            if (!filename.toLowerCase().endsWith(".json")) {
              filename += ".json";
            }
          }
          graphToPrompt.bind(app)().then(p=>{
            const json = JSON.stringify(p.workflow, null, 2); // convert the data to a JSON string
            const blob = new Blob([json], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = $el("a", {
              href: url,
              download: filename,
              style: {display: "none"},
              parent: document.body,
            });
            a.click();
            setTimeout(function () {
              a.remove();
              window.URL.revokeObjectURL(url);
            }, 0);
          });
        },
      })
    );

    window.comfyApp = app;
  },
});
