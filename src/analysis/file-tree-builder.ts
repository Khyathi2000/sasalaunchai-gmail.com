import type { FileNode } from "../types/index.js";
import type { ClassifiedFile } from "./file-classifier.js";

export function buildFileTree(files: ClassifiedFile[]): FileNode[] {
  const root: FileNode = {
    id: "root", name: "root", path: "/", type: "directory", children: [],
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = "/" + parts.slice(0, i + 1).join("/");

      if (isFile) {
        current.children!.push({
          id: `file-${currentPath.replace(/[^a-zA-Z0-9]/g, "-")}`,
          name: part, path: currentPath, type: "file",
          language: file.language, size: file.size,
          linesOfCode: file.linesOfCode, description: file.role,
        });
      } else {
        let dir = current.children!.find((c) => c.type === "directory" && c.name === part);
        if (!dir) {
          dir = {
            id: `dir-${currentPath.replace(/[^a-zA-Z0-9]/g, "-")}`,
            name: part, path: currentPath, type: "directory", children: [],
          };
          current.children!.push(dir);
        }
        current = dir;
      }
    }
  }

  function sortTree(node: FileNode) {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    }
  }

  sortTree(root);
  return root.children || [];
}
