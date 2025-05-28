
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  GoogleOAuthProvider,
  googleLogout,
  useGoogleLogin,
  type TokenResponse
} from '@react-oauth/google';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionTitle } from './section-title';
import { ListChecks, LogIn, LogOut, PlusCircle, Loader2, AlertCircle, Settings, ListPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from '@/components/ui/separator';

// Ensure gapi types are available
declare global {
  interface Window {
    gapi: any;
  }
}

interface TaskList {
  id: string;
  title: string;
}

interface Task {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string; // ISO date string
  notes?: string;
}

const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

const TaskListContent: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('googleTasksAccessToken');
    return null;
  });
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return !!localStorage.getItem('googleTasksAccessToken');
    return false;
  });

  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [selectedTaskListId, setSelectedTaskListId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('selectedGoogleTaskListId');
    return null;
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskListTitle, setNewTaskListTitle] = useState('');

  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTaskSettings, setShowTaskSettings] = useState(false);


  const loadGapiClient = useCallback(async () => {
    if (window.gapi && window.gapi.client && window.gapi.client.tasks) {
      return; // Already loaded
    }
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({}); // Minimal init
            console.log('TaskListWidget: GAPI client initialized.');
            resolve();
          } catch (initError) {
            console.error('TaskListWidget: Error initializing GAPI client:', initError);
            setError('Failed to initialize Google API client.');
            reject(initError);
          }
        });
      };
      script.onerror = (err) => {
         console.error('TaskListWidget: Error loading GAPI script:', err);
         setError('Failed to load Google API script.');
         reject(err);
      }
      document.body.appendChild(script);
    });
  }, []);

  const discoverTasksAPI = useCallback(async () => {
    if (!window.gapi || !window.gapi.client) {
        await loadGapiClient();
    }
    if (window.gapi && window.gapi.client && !window.gapi.client.tasks) {
        try {
            await window.gapi.client.load('https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest');
            console.log('TaskListWidget: Google Tasks API discovered.');
        } catch (e) {
            console.error('TaskListWidget: Error loading Tasks API discovery document:', e);
            setError('Failed to load Tasks API. Please refresh.');
            throw e;
        }
    }
  }, [loadGapiClient]);

  const handleSignOut = useCallback(() => {
    googleLogout();
    setAccessToken(null);
    setIsSignedIn(false);
    setTaskLists([]);
    setSelectedTaskListId(null);
    setTasks([]);
    setShowTaskSettings(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('googleTasksAccessToken');
      localStorage.removeItem('selectedGoogleTaskListId');
    }
    if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken(null);
    }
    console.log('TaskListWidget: Signed out.');
  }, []);

  const fetchTaskLists = useCallback(async (token: string) => {
    if (!token) return;
    setIsLoadingLists(true);
    setError(null);
    try {
      await discoverTasksAPI();
      window.gapi.client.setToken({ access_token: token });
      const response = await window.gapi.client.tasks.tasklists.list();
      setTaskLists(response.result.items || []);
      const currentStoredListId = typeof window !== 'undefined' ? localStorage.getItem('selectedGoogleTaskListId') : null;
      if (response.result.items && response.result.items.length > 0) {
        if (currentStoredListId && response.result.items.find((l: TaskList) => l.id === currentStoredListId)) {
            setSelectedTaskListId(currentStoredListId);
        } else {
            // Do not auto-select
        }
      } else {
        // No lists found, ensure selectedTaskListId is null if it pointed to a non-existent list
        if (currentStoredListId) {
            setSelectedTaskListId(null);
            if (typeof window !== 'undefined') localStorage.removeItem('selectedGoogleTaskListId');
        }
      }
    } catch (err: any) {
      console.error('TaskListWidget: Error fetching task lists:', err);
      setError(`Failed to fetch task lists: ${err.result?.error?.message || err.message || 'Unknown error'}. Try signing out and in again.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsLoadingLists(false);
    }
  }, [discoverTasksAPI, handleSignOut]);

  const fetchTasks = useCallback(async (token: string, listId: string) => {
    if (!token || !listId) return;
    setIsLoadingTasks(true);
    setError(null);
    try {
      await discoverTasksAPI();
      window.gapi.client.setToken({ access_token: token });
      const response = await window.gapi.client.tasks.tasks.list({
        tasklist: listId,
        showCompleted: false,
        showHidden: false,
        maxResults: 100, 
      });
      setTasks(response.result.items || []);
    } catch (err: any) {
      console.error('TaskListWidget: Error fetching tasks:', err);
      setError(`Failed to fetch tasks: ${err.result?.error?.message || err.message || 'Unknown error'}.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsLoadingTasks(false);
    }
  }, [discoverTasksAPI, handleSignOut]);

  useEffect(() => {
    if (accessToken && isSignedIn) {
      fetchTaskLists(accessToken);
    }
  }, [accessToken, isSignedIn, fetchTaskLists]);

  useEffect(() => {
    if (accessToken && selectedTaskListId && isSignedIn) {
      fetchTasks(accessToken, selectedTaskListId);
    } else {
      setTasks([]);
    }
  }, [accessToken, selectedTaskListId, isSignedIn, fetchTasks]);


  const handleLoginSuccess = (tokenResponse: Omit<TokenResponse, 'error' | 'error_description' | 'error_uri'>) => {
    const newAccessToken = tokenResponse.access_token;
    setAccessToken(newAccessToken);
    setIsSignedIn(true);
    if (typeof window !== 'undefined') localStorage.setItem('googleTasksAccessToken', newAccessToken);
    console.log('TaskListWidget: Login successful, token acquired.');
    fetchTaskLists(newAccessToken);
  };
  
  const login = useGoogleLogin({
    onSuccess: handleLoginSuccess,
    onError: (errorResponse) => {
      console.error('TaskListWidget: Google Login Failed:', errorResponse);
      setError(`Google Sign-In failed: ${errorResponse.error_description || errorResponse.error || 'Unknown error'}`);
      handleSignOut();
    },
    scope: GOOGLE_TASKS_SCOPE,
    flow: 'implicit',
  });

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !accessToken || !selectedTaskListId) return;
    setIsAddingTask(true);
    setError(null);
    try {
      await discoverTasksAPI();
      window.gapi.client.setToken({ access_token: accessToken });
      const response = await window.gapi.client.tasks.tasks.insert({
        tasklist: selectedTaskListId,
        resource: { title: newTaskTitle.trim() },
      });
      setTasks(prevTasks => [response.result, ...prevTasks]);
      setNewTaskTitle('');
      toast({ title: "Task Added", description: `"${response.result.title}" added.` });
    } catch (err: any) {
      console.error('TaskListWidget: Error adding task:', err);
      setError(`Failed to add task: ${err.result?.error?.message || err.message || 'Unknown error'}.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsAddingTask(false);
    }
  };

  const handleToggleTaskCompletion = async (task: Task) => {
    if (!accessToken || !selectedTaskListId) return;

    const newStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    const originalTasks = tasks;
    setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

    try {
      await discoverTasksAPI();
      window.gapi.client.setToken({ access_token: accessToken });
      await window.gapi.client.tasks.tasks.update({
        tasklist: selectedTaskListId,
        task: task.id,
        resource: { id: task.id, status: newStatus, title: task.title },
      });
      toast({ title: "Task Updated", description: `"${task.title}" marked as ${newStatus === 'completed' ? 'complete' : 'incomplete'}.`});
       if (newStatus === 'completed') {
        setTimeout(() => {
          setTasks(prev => prev.filter(t => t.id !== task.id));
        }, 1000);
      }
    } catch (err: any) {
      console.error('TaskListWidget: Error updating task:', err);
      setError(`Failed to update task: ${err.result?.error?.message || err.message || 'Unknown error'}.`);
      setTasks(originalTasks);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    }
  };

  const handleCreateTaskList = async () => {
    if (!newTaskListTitle.trim() || !accessToken) return;
    setIsCreatingList(true);
    setError(null);
    try {
      await discoverTasksAPI();
      window.gapi.client.setToken({ access_token: accessToken });
      const response = await window.gapi.client.tasks.tasklists.insert({
        resource: { title: newTaskListTitle.trim() },
      });
      toast({ title: "Task List Created", description: `"${response.result.title}" created.` });
      setNewTaskListTitle('');
      await fetchTaskLists(accessToken); // Refresh lists
      // Optionally, select the new list
      setSelectedTaskListId(response.result.id);
      if (typeof window !== 'undefined') localStorage.setItem('selectedGoogleTaskListId', response.result.id);

    } catch (err: any) {
      console.error('TaskListWidget: Error creating task list:', err);
      setError(`Failed to create task list: ${err.result?.error?.message || err.message || 'Unknown error'}.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsCreatingList(false);
    }
  };

  return (
      <Card className="shadow-lg flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex justify-between items-center">
            <SectionTitle icon={ListChecks} title="Google Tasks" className="mb-0" />
            <div className="flex items-center gap-1">
              {isSignedIn && (
                <Button variant="ghost" size="sm" onClick={() => setShowTaskSettings(!showTaskSettings)} aria-label="Task Settings">
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              {isSignedIn && (
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex flex-col overflow-hidden">
          {!isSignedIn ? (
             <div className="flex flex-col items-center justify-center py-8">
                <p className="text-muted-foreground mb-4">Sign in to manage your Google Tasks.</p>
                <Button onClick={() => login()} variant="default">
                   <LogIn className="mr-2 h-4 w-4" /> Sign In with Google
                </Button>
                {error && <p className="text-destructive text-sm mt-4 text-center">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col">
              {error && <Alert variant="destructive" className="mb-4 text-xs"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
              
              {showTaskSettings && (
                <div className="mb-4 p-3 border rounded-lg bg-muted/10 shadow-sm space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Select Task List</p>
                    {isLoadingLists ? (
                      <div className="flex items-center justify-center py-2"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading task lists...</div>
                    ) : taskLists.length > 0 ? (
                      <Select
                        value={selectedTaskListId || undefined}
                        onValueChange={(value) => {
                          setSelectedTaskListId(value);
                          if (typeof window !== 'undefined') localStorage.setItem('selectedGoogleTaskListId', value);
                        }}
                        disabled={isLoadingTasks}
                      >
                        <SelectTrigger className="w-full flex-shrink-0">
                          <SelectValue placeholder="Select a task list" />
                        </SelectTrigger>
                        <SelectContent>
                          {taskLists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                              {list.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-1">No task lists found. Try creating one below.</p>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Create New Task List</p>
                    <div className="flex">
                      <Input
                        type="text"
                        value={newTaskListTitle}
                        onChange={(e) => setNewTaskListTitle(e.target.value)}
                        placeholder="New list title..."
                        className="mr-2"
                        onKeyPress={(e) => e.key === 'Enter' && !isCreatingList && handleCreateTaskList()}
                        disabled={isCreatingList}
                      />
                      <Button onClick={handleCreateTaskList} disabled={!newTaskListTitle.trim() || isCreatingList} size="sm">
                        {isCreatingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  {selectedTaskListId && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Add New Task to "{taskLists.find(l => l.id === selectedTaskListId)?.title || 'Selected List'}"</p>
                        <div className="flex">
                          <Input
                            type="text"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="New task title..."
                            className="mr-2"
                            onKeyPress={(e) => e.key === 'Enter' && !isAddingTask && handleAddTask()}
                            disabled={isAddingTask}
                          />
                          <Button onClick={handleAddTask} disabled={!newTaskTitle.trim() || isAddingTask || !selectedTaskListId} size="sm">
                            {isAddingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Task Display Area */}
              {selectedTaskListId ? (
                isLoadingTasks ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading tasks...</div>
                ) : tasks.length > 0 ? (
                  <ScrollArea className="pr-1 max-h-60">
                    <ul className="space-y-2">
                      {tasks.map((task) => (
                        <li key={task.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                          <Checkbox
                            id={`task-${task.id}`}
                            checked={task.status === 'completed'}
                            onCheckedChange={() => handleToggleTaskCompletion(task)}
                            aria-label={`Mark task ${task.title} as ${task.status === 'completed' ? 'incomplete' : 'complete'}`}
                          />
                          <label
                            htmlFor={`task-${task.id}`}
                            className={`flex-1 text-sm ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}
                          >
                            {task.title}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No active tasks in this list. Add one in settings!</p>
                )
              ) : (
                !isLoadingLists && taskLists.length > 0 && !showTaskSettings && (
                  <p className="text-sm text-muted-foreground text-center py-4">Please select a task list from settings to view tasks.</p>
                )
              )}
               {!isLoadingLists && taskLists.length === 0 && isSignedIn && !error && !showTaskSettings &&(
                 <p className="text-sm text-muted-foreground text-center py-4">No Google Task lists found. Click settings <Settings className="inline h-3 w-3"/> to create one or select if already created.</p>
               )}
            </div>
          )}
        </CardContent>
      </Card>
  );
};


export function TaskListWidget() {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Ensure this code only runs on the client
    if (typeof window !== 'undefined') {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (clientId) {
        setGoogleClientId(clientId);
      } else {
        console.error("TaskListWidget: NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set in .env.local");
        setProviderError("Google Client ID not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env.local file and restart the server.");
      }
    }
  }, []);

  if (!isClient) {
    // Return a placeholder or null during SSR/build time
    return (
       <Card className="shadow-lg">
        <CardHeader><SectionTitle icon={ListChecks} title="Google Tasks" /></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading Google Tasks...</p></CardContent>
      </Card>
    );
  }

  if (providerError || !googleClientId) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={ListChecks} title="Google Tasks" />
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription>
              {providerError || "Google Client ID is not available. Please configure it."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <TaskListContent />
    </GoogleOAuthProvider>
  );
}

