import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { deleteSession, getAllSession, renameSession, switchToSession, type TmuxSession } from "./utils/sessionUtils";
import CreateNewTmuxSession from "./create_new_session";
import SessionWindowsList from "./manage_tmux_windows";

export default function Command() {
  const [sessions, setSessions] = useState<Array<TmuxSession>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [renamingSessionName, setRenamingSessionName] = useState<string | null>(null);

  const setupListSesssions = () => {
    getAllSession((error, stdout) => {
      if (error) {
        console.error(`exec error: ${error}`);
        setIsLoading(false);
        return;
      }

      const lines = stdout.trim().split("\n");

      if (lines?.length > 0) {
        const parsedSessions = lines
          .filter(Boolean)
          .map((name) => ({ name, windowsCount: 0, isAttached: false }) satisfies TmuxSession)
          .sort((left, right) => left.name.localeCompare(right.name));

        setSessions(parsedSessions);
      } else {
        setSessions([]);
      }

      setIsLoading(false);
    });
  };

  useEffect(() => {
    setIsLoading(true);
    setupListSesssions();
  }, []);

  const startRenameSession = (sessionName: string) => {
    setRenamingSessionName(sessionName);
    setSearchText(sessionName);
  };

  const cancelRenameSession = () => {
    setRenamingSessionName(null);
    setSearchText("");
  };

  const submitRenameSession = async () => {
    if (!renamingSessionName) {
      return;
    }

    const renamedSession = searchText.trim();
    const toast = await showToast({ style: Toast.Style.Animated, title: "Renaming session" });

    if (!renamedSession) {
      toast.style = Toast.Style.Failure;
      toast.title = "Session name is required";
      return;
    }

    if (renamedSession === renamingSessionName) {
      toast.style = Toast.Style.Failure;
      toast.title = "Session name is unchanged";
      return;
    }

    if (sessions.some((session) => session.name === renamedSession && session.name !== renamingSessionName)) {
      toast.style = Toast.Style.Failure;
      toast.title = "Session name already exists";
      return;
    }

    setIsLoading(true);

    renameSession(renamingSessionName, renamedSession, (error, _stdout, stderr) => {
      setIsLoading(false);

      if (error || stderr) {
        console.error(`exec error: ${error || stderr}`);
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to rename session";
        toast.message = error ? error.message : stderr;
        return;
      }

      toast.style = Toast.Style.Success;
      toast.title = `Renamed session to ${renamedSession}`;
      cancelRenameSession();
      setupListSesssions();
    });
  };

  const renamingSession = renamingSessionName ? sessions.find((session) => session.name === renamingSessionName) : undefined;

  return (
    <List
      isLoading={isLoading}
      filtering={renamingSession ? false : true}
      searchBarPlaceholder={renamingSession ? "Type the new session name" : "Search sessions by name, state, or window count"}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      selectedItemId={renamingSession?.name}
    >
      {renamingSession ? (
        <List.Item
          id={renamingSession.name}
          icon={Icon.Pencil}
          title={searchText || renamingSession.name}
          subtitle={`Current name: ${renamingSession.name}`}
          accessories={[{ text: { value: "editing", color: Color.Yellow } }]}
          actions={
            <ActionPanel>
              <Action title="Save Session Rename" onAction={submitRenameSession} />
              <Action title="Cancel Rename" onAction={cancelRenameSession} />
            </ActionPanel>
          }
        />
      ) : (
        sessions.map((session) => (
          <List.Item
            key={session.name}
            id={session.name}
            icon={Icon.Terminal}
            keywords={[session.name]}
            title={session.name}
            accessories={[{ text: { value: "session", color: Color.SecondaryText } }]}
            actions={
              <ActionPanel>
                <Action title="Open Selected Session" onAction={() => switchToSession(session.name, setIsLoading)} />
                <Action.Push title="Browse Session Windows" target={<SessionWindowsList sessionName={session.name} />} />
                <Action.Push title="Create New Session" target={<CreateNewTmuxSession />} />
                <Action title="Refresh Sessions" onAction={setupListSesssions} shortcut={{ modifiers: ["cmd"], key: "r" }} />
                <Action
                  title="Rename This Session"
                  onAction={() => startRenameSession(session.name)}
                  shortcut={{ modifiers: ["cmd", "opt"], key: "r" }}
                />
                <Action
                  title="Delete This Session"
                  onAction={() =>
                    deleteSession(session.name, setIsLoading, () =>
                      setSessions((currentSessions) => currentSessions.filter((currentSession) => currentSession.name !== session.name)),
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
