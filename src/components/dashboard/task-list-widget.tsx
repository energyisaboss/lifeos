
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  GoogleOAuthProvider,
  GoogleLogin,
  googleLogout,
  hasGrantedAllScopesGoogle,
  useGoogleLogin,
  TokenResponse
} from '@react-oauth/google';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionTitle } from './section-title';
import { ListChecks, LogIn, LogOut, PlusCircle, Loader2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// Ensure gapi types are available, can be enhanced with more specific types
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

export function TaskListWidget() {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('googleTasksAccessToken'));
  const [isSignedIn, setIsSignedIn] = useState<boolean>(!!localStorage.getItem('googleTasksAccessToken'));

  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [selectedTaskListId, setSelectedTaskListId] = useState<string | null>(localStorage.getItem('selectedGoogleTaskListId'));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (clientId) {
      setGoogleClientId(clientId);
    } else {
      console.error("TaskListWidget: NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set in .env.local");
      setError("Google Client ID not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local");
    }
  }, []);

  const loadGapiClient = useCallback(async () => {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({}); // Minimal init, discoveryDocs loaded per API
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


  const fetchTaskLists = useCallback(async (token: string) => {
    if (!token) return;
    setIsLoadingLists(true);
    setError(null);
    try {
      await discoverTasksAPI();
      window.gapi.client.setToken({ access_token: token });
      const response = await window.gapi.client.tasks.tasklists.list();
      setTaskLists(response.result.items || []);
      if (response.result.items && response.result.items.length > 0 && !selectedTaskListId) {
        const defaultListId = response.result.items[0].id;
        setSelectedTaskListId(defaultListId);
        localStorage.setItem('selectedGoogleTaskListId', defaultListId);
      }
    } catch (err: any) {
      console.error('TaskListWidget: Error fetching task lists:', err);
      setError(`Failed to fetch task lists: ${err.result?.error?.message || err.message || 'Unknown error'}. Try signing out and in again.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsLoadingLists(false);
    }
  }, [discoverTasksAPI, selectedTaskListId]);

  const fetchTasks = useCallback(async (token: string, listId: string) => {
    if (!token || !listId) return;
    setIsLoadingTasks(true);
    setError(null);
    try {
      await discoverTasksAPI();
      window.gapi.client.setToken({ access_token: token });
      const response = await window.gapi.client.tasks.tasks.list({
        tasklist: listId,
        showCompleted: false, // Optionally fetch completed tasks too
        showHidden: false,
      });
      setTasks(response.result.items || []);
    } catch (err: any) {
      console.error('TaskListWidget: Error fetching tasks:', err);
      setError(`Failed to fetch tasks: ${err.result?.error?.message || err.message || 'Unknown error'}.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsLoadingTasks(false);
    }
  }, [discoverTasksAPI]);

  useEffect(() => {
    if (accessToken && isSignedIn) {
      fetchTaskLists(accessToken);
    }
  }, [accessToken, isSignedIn, fetchTaskLists]);

  useEffect(() => {
    if (accessToken && selectedTaskListId && isSignedIn) {
      fetchTasks(accessToken, selectedTaskListId);
    } else {
      setTasks([]); // Clear tasks if no list selected or not signed in
    }
  }, [accessToken, selectedTaskListId, isSignedIn, fetchTasks]);


  const handleLoginSuccess = (tokenResponse: Omit<TokenResponse, 'error' | 'error_description' | 'error_uri'>) => {
    const newAccessToken = tokenResponse.access_token;
    setAccessToken(newAccessToken);
    setIsSignedIn(true);
    localStorage.setItem('googleTasksAccessToken', newAccessToken);
    console.log('TaskListWidget: Login successful, token acquired.');
    fetchTaskLists(newAccessToken);
  };
  
  const login = useGoogleLogin({
    onSuccess: handleLoginSuccess,
    onError: (errorResponse) => {
      console.error('TaskListWidget: Google Login Failed:', errorResponse);
      setError(`Google Sign-In failed: ${errorResponse.error_description || errorResponse.error || 'Unknown error'}`);
      handleSignOut(); // Clear any partial state
    },
    scope: GOOGLE_TASKS_SCOPE,
    flow: 'implicit', // Use implicit flow to get access token directly
  });

  const handleSignOut = () => {
    googleLogout();
    setAccessToken(null);
    setIsSignedIn(false);
    setTaskLists([]);
    setSelectedTaskListId(null);
    setTasks([]);
    localStorage.removeItem('googleTasksAccessToken');
    localStorage.removeItem('selectedGoogleTaskListId');
    if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken(null);
    }
    console.log('TaskListWidget: Signed out.');
  };

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
    // Optimistically update UI
    setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

    try {
      await discoverTasksAPI();
      window.gapi.client.setToken({ access_token: accessToken });
      await window.gapi.client.tasks.tasks.update({
        tasklist: selectedTaskListId,
        task: task.id,
        resource: { id: task.id, status: newStatus, title: task.title }, // title is required by API even if not changing
      });
      // If successful, UI is already updated. We might want to re-fetch to confirm.
      // For now, let's rely on optimistic update.
      toast({ title: "Task Updated", description: `"${task.title}" marked as ${newStatus === 'completed' ? 'complete' : 'incomplete'}.`});
       if (newStatus === 'completed') { // If marked complete, remove from active view after a short delay
        setTimeout(() => {
          setTasks(prev => prev.filter(t => t.id !== task.id));
        }, 1000);
      }

    } catch (err: any) {
      console.error('TaskListWidget: Error updating task:', err);
      setError(`Failed to update task: ${err.result?.error?.message || err.message || 'Unknown error'}.`);
      setTasks(originalTasks); // Revert optimistic update on error
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    }
  };
  
  if (!googleClientId) {
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
              Google Client ID is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env.local file and restart the server.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }


  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <Card className="shadow-lg flex flex-col h-full">
        <CardHeader className="flex-shrink-0">
          <div className="flex justify-between items-center">
            <SectionTitle icon={ListChecks} title="Google Tasks" className="mb-0" />
            {isSignedIn && (
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign Out
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-grow flex flex-col overflow-hidden">
          {!isSignedIn ? (
             <div className="flex flex-col items-center justify-center h-full">
                <p className="text-muted-foreground mb-4">Sign in to manage your Google Tasks.</p>
                <Button onClick={() => login()} variant="default">
                   <LogIn className="mr-2 h-4 w-4" /> Sign In with Google
                </Button>
                {error && <p className="text-destructive text-sm mt-4 text-center">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {error && <Alert variant="destructive" className="mb-4 text-xs"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
              
              {isLoadingLists ? (
                <div className="flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading task lists...</div>
              ) : taskLists.length > 0 ? (
                <Select
                  value={selectedTaskListId || undefined}
                  onValueChange={(value) => {
                    setSelectedTaskListId(value);
                    localStorage.setItem('selectedGoogleTaskListId', value);
                  }}
                  disabled={isLoadingTasks}
                >
                  <SelectTrigger className="mb-3 w-full flex-shrink-0">
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
                <p className="text-sm text-muted-foreground text-center py-2">No task lists found or unable to load them.</p>
              )}

              {selectedTaskListId && (
                <div className="flex mb-3 flex-shrink-0">
                  <Input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Add a new task..."
                    className="mr-2"
                    onKeyPress={(e) => e.key === 'Enter' && !isAddingTask && handleAddTask()}
                    disabled={isAddingTask}
                  />
                  <Button onClick={handleAddTask} disabled={!newTaskTitle.trim() || isAddingTask}>
                    {isAddingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                  </Button>
                </div>
              )}

              {isLoadingTasks && selectedTaskListId ? (
                <div className="flex items-center justify-center flex-grow"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading tasks...</div>
              ) : tasks.length > 0 && selectedTaskListId ? (
                <ScrollArea className="flex-grow pr-1">
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
              ) : selectedTaskListId && !isLoadingLists && (
                <p className="text-sm text-muted-foreground text-center py-4 flex-grow">No active tasks in this list. Add one above!</p>
              )}
              {!selectedTaskListId && !isLoadingLists && taskLists.length > 0 && (
                 <p className="text-sm text-muted-foreground text-center py-4 flex-grow">Select a task list to view tasks.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </GoogleOAuthProvider>
  );
}
