import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { deleteWindow, getSessionWindows, renameWindow, switchToWindow, type TmuxWindow } from "./utils/windowUtils";

function toNumber(value: string | undefined, fallback = 0): number {
  const parsedValue = Number.parseInt(value || "", 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export default function SessionWindowsList({ sessionName }: { sessionName: string }) {
  const [windows, setWindows] = useState<Array<TmuxWindow & { keyIndex: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [renamingWindowIndex, setRenamingWindowIndex] = useState<number | null>(null);

  const setupListWindows = () => {
    getSessionWindows(sessionName, (error, stdout) => {
      if (error) {
        console.error(`exec error: ${error}`);
        setIsLoading(false);
        return;
      }

      const lines = stdout.trim().split("\n");

      if (lines?.length > 0) {
        let keyIndex = 0;
        const windows = lines.map((line) => {
          const [, windowName, windowIndex] = line.split("\t");
          keyIndex += 1;
          return {
            keyIndex,
            sessionName,
            windowIndex: toNumber(windowIndex),
            windowName,
          };
        });

        setWindows(windows);
      } else {
        setWindows([]);
      }

      setIsLoading(false);
    });
  };

  useEffect(() => {
    setIsLoading(true);
    setupListWindows();
  }, [sessionName]);

  const startRenameWindow = (windowIndex: number, windowName: string) => {
    setRenamingWindowIndex(windowIndex);
    setSearchText(windowName);
  };

  const cancelRenameWindow = () => {
    setRenamingWindowIndex(null);
    setSearchText("");
  };

  const submitRenameWindow = async () => {
    if (renamingWindowIndex === null) {
      return;
    }

    const window = windows.find((entry) => entry.windowIndex === renamingWindowIndex);

    if (!window) {
      cancelRenameWindow();
      return;
    }

    const renamedWindow = searchText.trim();
    const toast = await showToast({ style: Toast.Style.Animated, title: "Renaming window" });

    if (!renamedWindow) {
      toast.style = Toast.Style.Failure;
      toast.title = "Window name is required";
      return;
    }

    if (renamedWindow === window.windowName) {
      toast.style = Toast.Style.Failure;
      toast.title = "Window name is unchanged";
      return;
    }

    setIsLoading(true);

    renameWindow(sessionName, window.windowIndex, renamedWindow, (error, _stdout, stderr) => {
      setIsLoading(false);

      if (error || stderr) {
        console.error(`exec error: ${error || stderr}`);
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to rename window";
        toast.message = error ? error.message : stderr;
        return;
      }

      toast.style = Toast.Style.Success;
      toast.title = `Renamed window to ${renamedWindow}`;
      cancelRenameWindow();
      setupListWindows();
    });
  };

  const renamingWindow = renamingWindowIndex === null ? undefined : windows.find((window) => window.windowIndex === renamingWindowIndex);

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Windows · ${sessionName}`}
      filtering={renamingWindow ? false : true}
      searchBarPlaceholder={renamingWindow ? "Type the new window name" : `Search windows in ${sessionName}`}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      selectedItemId={renamingWindow ? `${renamingWindow.windowIndex}` : undefined}
    >
      {renamingWindow ? (
        <List.Item
          id={`${renamingWindow.windowIndex}`}
          key={`${renamingWindow.windowIndex}:${renamingWindow.keyIndex}`}
          icon={Icon.Pencil}
          keywords={[renamingWindow.windowName, String(renamingWindow.windowIndex), `:${renamingWindow.windowIndex}`]}
          title={searchText || renamingWindow.windowName || "(unnamed window)"}
          subtitle={`Current name: ${renamingWindow.windowName || "(unnamed window)"}`}
          accessories={[
            {
              text: { value: "editing", color: Color.Yellow },
            },
          ]}
          actions={
            <ActionPanel>
              <Action title="Save Window Rename" onAction={submitRenameWindow} />
              <Action title="Cancel Rename" onAction={cancelRenameWindow} />
            </ActionPanel>
          }
        />
      ) : (
        windows.map((window) => (
          <List.Item
            id={`${window.windowIndex}`}
            key={`${window.windowIndex}:${window.keyIndex}`}
            icon={Icon.Gear}
            keywords={[window.windowName, String(window.windowIndex), `:${window.windowIndex}`]}
            title={window.windowName || "(unnamed window)"}
            subtitle={`window ${window.windowIndex}`}
            accessories={[
              {
                text: `:${window.windowIndex}`,
              },
            ]}
            actions={
              <ActionPanel>
                <Action title="Open Selected Window" onAction={() => switchToWindow(window, setIsLoading)} />
                <Action title="Refresh Windows" onAction={setupListWindows} shortcut={{ modifiers: ["cmd"], key: "r" }} />
                <Action
                  title="Rename This Window"
                  onAction={() => startRenameWindow(window.windowIndex, window.windowName)}
                  shortcut={{ modifiers: ["cmd", "opt"], key: "r" }}
                />
                <Action
                  title="Delete This Window"
                  onAction={() =>
                    deleteWindow(window, setIsLoading, () =>
                      setWindows((currentWindows) =>
                        currentWindows.filter((currentWindow) => currentWindow.keyIndex !== window.keyIndex),
                      ),
                    )
                  }
                  shortcut={{ modifiers: ["cmd", "opt"], key: "x" }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
