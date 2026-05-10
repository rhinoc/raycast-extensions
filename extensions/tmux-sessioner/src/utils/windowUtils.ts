import { ChildProcess, exec, ExecException } from "child_process";
import { env } from "../config";
import { showHUD, showToast, Toast } from "@raycast/api";
import { runCommandInTerminal, shellEscape } from "./terminalUtils";

export interface TmuxWindow {
  sessionName: string;
  windowIndex: number;
  windowName: string;
}

export function getSessionWindows(
  sessionName: string,
  callback: (error: ExecException | null, stdout: string, stderr: string) => void,
): ChildProcess {
  return exec(
    `tmux list-windows -t ${shellEscape(sessionName)} -F '#{session_name}	#{window_name}	#{window_index}'`,
    { env },
    callback,
  );
}

export async function switchToWindow(window: TmuxWindow, setLoading: (value: boolean) => void) {
  const toast = await showToast({ style: Toast.Style.Animated, title: "" });
  setLoading(true);
  const { sessionName: session, windowIndex, windowName } = window;

  exec(`tmux select-window -t ${shellEscape(`${session}:${windowIndex}`)}`, { env }, async (error, stdout, stderr) => {
    if (error || stderr) {
      console.error(`exec error: ${error || stderr}`);

      toast.style = Toast.Style.Failure;
      toast.title = "Failed to select tmux window 😢";
      toast.message = error ? error.message : stderr;
      setLoading(false);

      return;
    }

    try {
      await runCommandInTerminal(`tmux attach-session -t ${shellEscape(session)}`);

      toast.style = Toast.Style.Success;
      toast.title = `Opened window ${windowName}`;
      await showHUD(`Opened window ${windowName}`);
      setLoading(false);
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to open terminal 😢";
      toast.message = e instanceof Error ? e.message : String(e);
      setLoading(false);
    }
    return;
  });
}

export function renameWindow(
  sessionName: string,
  windowIndex: number,
  newWindowName: string,
  callback: (error: ExecException | null, stdout: string, stderr: string) => void,
): ChildProcess {
  return exec(
    `tmux rename-window -t ${shellEscape(`${sessionName}:${windowIndex}`)} ${shellEscape(newWindowName)}`,
    { env },
    callback,
  );
}

export async function deleteWindow(window: TmuxWindow, setLoading: (value: boolean) => void, callback: () => void) {
  setLoading(true);
  const toast = await showToast({ style: Toast.Style.Animated, title: "" });

  exec(`tmux kill-window -t ${shellEscape(`${window.sessionName}:${window.windowIndex}`)}`, { env }, (error, stdout, stderr) => {
    if (error || stderr) {
      console.error(`exec error: ${error || stderr}`);

      toast.style = Toast.Style.Failure;
      toast.title = "Something went wrong 😢";
      toast.message = error ? error.message : stderr;
      setLoading(false);
      return;
    }

    toast.style = Toast.Style.Success;
    toast.title = `Deleted window ${window.windowName}`;
    callback();
    setLoading(false);
  });
}
