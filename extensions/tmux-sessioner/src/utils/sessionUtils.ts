import { type ChildProcess, exec, type ExecException } from "node:child_process";
import { env } from "../config";
import { showHUD, showToast, Toast } from "@raycast/api";
import { runCommandInTerminal, shellEscape } from "./terminalUtils";
import fs from "node:fs";

export interface TmuxSession {
  name: string;
  windowsCount: number;
  isAttached: boolean;
  createdAt?: Date;
  activityAt?: Date;
}

export function getAllSession(
  callback: (error: ExecException | null, stdout: string, stderr: string) => void,
): ChildProcess {
  return exec(`tmux list-sessions -F '#{session_name}'`, { env }, callback);
}

export function directoryExists(directory: string): boolean {
  return fs.existsSync(directory);
}

export function createNewSession(
  sessionName: string,
  sessionDirectory: string,
  callback: (error: ExecException | null, stdout: string, stderr: string) => void,
): ChildProcess {
  return exec(
    `tmux new-session -d -s ${shellEscape(sessionName)} -c ${shellEscape(sessionDirectory)}`,
    { env },
    callback,
  );
}

export function renameSession(
  oldSessionName: string,
  newSessionName: string,
  callback: (error: ExecException | null, stdout: string, stderr: string) => void,
): ChildProcess {
  return exec(
    `tmux rename-session -t ${shellEscape(oldSessionName)} ${shellEscape(newSessionName)}`,
    { env },
    callback,
  );
}

export async function switchToSession(session: string, setLoading: (value: boolean) => void) {
  const toast = await showToast({ style: Toast.Style.Animated, title: "" });
  setLoading(true);

  try {
    await runCommandInTerminal(`tmux attach-session -t ${shellEscape(session)}`);

    toast.style = Toast.Style.Success;
    toast.title = `Opened session ${session}`;
    await showHUD(`Opened session ${session}`);
  } catch (error) {
    console.error(`exec error: ${error}`);

    toast.style = Toast.Style.Failure;
    toast.title = "Failed to open terminal 😢";
    toast.message = error instanceof Error ? error.message : String(error);
  } finally {
    setLoading(false);
  }
}

export async function deleteSession(session: string, setLoading: (value: boolean) => void, callback: () => void) {
  setLoading(true);
  const toast = await showToast({ style: Toast.Style.Animated, title: "" });

  exec(`tmux kill-session -t ${shellEscape(session)}`, { env }, (error, stdout, stderr) => {
    if (error || stderr) {
      console.error(`exec error: ${error || stderr}`);

      toast.style = Toast.Style.Failure;
      toast.title = "Something went wrong 😢";
      toast.message = error ? error.message : stderr;
      setLoading(false);
      return;
    }

    toast.style = Toast.Style.Success;
    toast.title = `Deleted session ${session}`;
    callback();
    setLoading(false);
  });
}
