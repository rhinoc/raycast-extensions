import { closeMainWindow, getPreferenceValues } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

type TerminalPreferences = {
  terminalAppBundleId?: string;
};

const TERMINAL_APP_NAMES: Record<string, string> = {
  "net.kovidgoyal.kitty": "kitty",
  "org.alacritty": "Alacritty",
  "com.mitchellh.ghostty": "Ghostty",
  "com.googlecode.iterm2": "iTerm",
  "com.apple.Terminal": "Terminal",
  "dev.warp.Warp-Stable": "Warp",
  "com.github.wez.wezterm": "WezTerm",
};

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildItermScript(command: string): string {
  const escapedCommand = escapeAppleScriptString(command);

  return `
    tell application "iTerm"
      activate
      if (count of windows) > 0 then
        tell current window
          create tab with default profile
          tell current session of current tab
            write text "${escapedCommand}"
          end tell
        end tell
      else
        create window with default profile
        tell current session of current window
          write text "${escapedCommand}"
        end tell
      end if
    end tell
  `;
}

function buildTerminalScript(command: string): string {
  const escapedCommand = escapeAppleScriptString(command);

  return `
    tell application "Terminal"
      activate
      do script "${escapedCommand}"
    end tell
  `;
}

function buildGenericTerminalScript(terminalAppName: string, command: string): string {
  const escapedCommand = escapeAppleScriptString(command);

  return `
    tell application "${terminalAppName}"
      activate
    end tell
    delay 0.3
    tell application "System Events"
      tell process "${terminalAppName}"
        keystroke "n" using command down
        delay 0.3
        keystroke "${escapedCommand}"
        key code 36
      end tell
    end tell
  `;
}

function openWarpUri(uri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("open", ["-b", "dev.warp.Warp-Stable", uri], (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

async function writeWarpLaunchConfiguration(command: string): Promise<string> {
  const launchConfigurationsDirectory = path.join(os.homedir(), ".warp", "launch_configurations");
  const configurationId = `raycast-tmux-sessioner-${randomUUID()}`;
  const fileName = `${configurationId}.yaml`;
  const filePath = path.join(launchConfigurationsDirectory, fileName);
  const workingDirectory = process.env.HOME || "/";
  const launchConfiguration = `# Warp Launch Configuration
---
name: ${yamlString(configurationId)}
windows:
  - tabs:
      - title: ${yamlString("Tmux Sessioner")}
        layout:
          cwd: ${yamlString(workingDirectory)}
          commands:
            - exec: ${yamlString(command)}
`;

  await fs.mkdir(launchConfigurationsDirectory, { recursive: true });
  await fs.writeFile(filePath, launchConfiguration, "utf8");

  return filePath;
}

function cleanupWarpLaunchConfiguration(filePath: string) {
  setTimeout(() => {
    void fs.unlink(filePath).catch(() => undefined);
  }, 60_000);
}

async function runCommandInWarp(command: string) {
  const launchConfigurationPath = await writeWarpLaunchConfiguration(command);
  const launchConfigurationName = path.basename(launchConfigurationPath, ".yaml");

  try {
    await openWarpUri(`warp://launch/${encodeURIComponent(launchConfigurationName)}`);
  } finally {
    cleanupWarpLaunchConfiguration(launchConfigurationPath);
  }
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export async function runCommandInTerminal(command: string) {
  const preferences = getPreferenceValues<TerminalPreferences>();
  const localTerminalAppBundleId = preferences.terminalAppBundleId || "com.apple.Terminal";

  const terminalAppName = TERMINAL_APP_NAMES[localTerminalAppBundleId];

  if (!terminalAppName) {
    throw new Error(`Unsupported terminal app: ${localTerminalAppBundleId}`);
  }

  await closeMainWindow();
  await delay(200);

  if (localTerminalAppBundleId === "com.googlecode.iterm2") {
    await runAppleScript(buildItermScript(command));
    return;
  }

  if (localTerminalAppBundleId === "com.apple.Terminal") {
    await runAppleScript(buildTerminalScript(command));
    return;
  }

  if (localTerminalAppBundleId === "dev.warp.Warp-Stable") {
    await runCommandInWarp(command);
    return;
  }

  await runAppleScript(buildGenericTerminalScript(terminalAppName, command));
}
