
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GoogleOAuthProvider,
  googleLogout,
  useGoogleLogin,
  type TokenResponse
} from '@react-oauth/google';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionTitle } from './section-title';
import { ListChecks, LogIn, LogOut, PlusCircle, Loader2, AlertCircle, Settings, ListPlus, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from '@/components/ui/separator';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
const VISIBLE_LISTS_STORAGE_KEY = 'visibleGoogleTaskListIds_v1';

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
  const [tasksByListId, setTasksByListId] = useState<Record<string, Task[]>>({});
  const [visibleListIds, setVisibleListIds] = useState<Record<string, boolean>>({});
  
  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>({}); // For new task inputs per list
  const [newTaskListTitle, setNewTaskListTitle] = useState('');

  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isLoadingTasksForList, setIsLoadingTasksForList] = useState<Record<string, boolean>>({});
  const [isAddingTaskForList, setIsAddingTaskForList] = useState<Record<string, boolean>>({});
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [error, setError] = useState<string | null>(null); // General error
  const [errorPerList, setErrorPerList] = useState<Record<string, string | null>>({});
  const [showTaskSettings, setShowTaskSettings] = useState(false);
  
  const gapiLoadedRef = useRef(false);

  const loadGapiClient = useCallback(async () => {
    if (gapiLoadedRef.current && window.gapi && window.gapi.client && window.gapi.client.tasks) {
      return; // Already loaded
    }
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({}); // Minimal init
            console.log('TaskListWidget: GAPI client initialized.');
            await window.gapi.client.load('https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest');
            console.log('TaskListWidget: Google Tasks API discovered.');
            gapiLoadedRef.current = true;
            resolve();
          } catch (initError) {
            console.error('TaskListWidget: Error initializing GAPI client or Tasks API:', initError);
            setError('Failed to initialize Google API client or Tasks API.');
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


  const handleSignOut = useCallback(() => {
    googleLogout();
    setAccessToken(null);
    setIsSignedIn(false);
    setTaskLists([]);
    setTasksByListId({});
    setVisibleListIds({});
    setShowTaskSettings(false);
    setError(null);
    setErrorPerList({});
    if (typeof window !== 'undefined') {
      localStorage.removeItem('googleTasksAccessToken');
      localStorage.removeItem(VISIBLE_LISTS_STORAGE_KEY); // Clear visibility preferences
    }
    if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken(null);
    }
    gapiLoadedRef.current = false; // Reset GAPI loaded state
    console.log('TaskListWidget: Signed out.');
  }, []);

  const fetchAndSetTasksForList = useCallback(async (token: string, listId: string) => {
    if (!token || !listId) return;
    setIsLoadingTasksForList(prev => ({ ...prev, [listId]: true }));
    setErrorPerList(prev => ({ ...prev, [listId]: null }));

    try {
      if (!gapiLoadedRef.current) await loadGapiClient();
      window.gapi.client.setToken({ access_token: token });
      const response = await window.gapi.client.tasks.tasks.list({
        tasklist: listId,
        showCompleted: false,
        showHidden: false,
        maxResults: 100,
      });
      setTasksByListId(prev => ({ ...prev, [listId]: response.result.items || [] }));
    } catch (err: any) {
      console.error(`TaskListWidget: Error fetching tasks for list ${listId}:`, err);
      setErrorPerList(prev => ({ ...prev, [listId]: `Failed to fetch tasks: ${err.result?.error?.message || err.message || 'Unknown error'}.`}));
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsLoadingTasksForList(prev => ({ ...prev, [listId]: false }));
    }
  }, [loadGapiClient, handleSignOut]);

  const fetchTaskLists = useCallback(async (token: string) => {
    if (!token) return;
    setIsLoadingLists(true);
    setError(null);
    try {
      if (!gapiLoadedRef.current) await loadGapiClient();
      window.gapi.client.setToken({ access_token: token });
      const response = await window.gapi.client.tasks.tasklists.list();
      const fetchedLists = response.result.items || [];
      setTaskLists(fetchedLists);

      const storedVisibleIds = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(VISIBLE_LISTS_STORAGE_KEY) || '{}') : {};
      setVisibleListIds(storedVisibleIds);
      
      // Fetch tasks for lists that are marked as visible
      fetchedLists.forEach(list => {
        if (storedVisibleIds[list.id]) {
          fetchAndSetTasksForList(token, list.id);
        }
      });

    } catch (err: any) {
      console.error('TaskListWidget: Error fetching task lists:', err);
      setError(`Failed to fetch task lists: ${err.result?.error?.message || err.message || 'Unknown error'}. Try signing out and in again.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsLoadingLists(false);
    }
  }, [loadGapiClient, handleSignOut, fetchAndSetTasksForList]);


  useEffect(() => {
    // Load GAPI client as soon as possible if signed in or attempting to sign in
    if (isSignedIn || !accessToken) { // Attempt to load if signed in, or to prepare for login
       loadGapiClient().catch(e => console.error("Failed to load GAPI on mount", e));
    }
  }, [isSignedIn, accessToken, loadGapiClient]);


  useEffect(() => {
    if (accessToken && isSignedIn && gapiLoadedRef.current) {
      fetchTaskLists(accessToken);
    }
  }, [accessToken, isSignedIn, fetchTaskLists]); // Removed gapiLoadedRef from deps here to avoid loop with fetchTaskLists


  const handleLoginSuccess = (tokenResponse: Omit<TokenResponse, 'error' | 'error_description' | 'error_uri'>) => {
    const newAccessToken = tokenResponse.access_token;
    setAccessToken(newAccessToken);
    setIsSignedIn(true);
    if (typeof window !== 'undefined') localStorage.setItem('googleTasksAccessToken', newAccessToken);
    console.log('TaskListWidget: Login successful, token acquired.');
    loadGapiClient().then(() => {
       fetchTaskLists(newAccessToken);
    }).catch(e => console.error("GAPI load failed post-login", e));
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

  const handleAddTask = async (listId: string) => {
    const title = newTaskTitles[listId]?.trim();
    if (!title || !accessToken) return;
    setIsAddingTaskForList(prev => ({ ...prev, [listId]: true }));
    setErrorPerList(prev => ({ ...prev, [listId]: null }));

    try {
      if (!gapiLoadedRef.current) await loadGapiClient();
      window.gapi.client.setToken({ access_token: accessToken });
      const response = await window.gapi.client.tasks.tasks.insert({
        tasklist: listId,
        resource: { title },
      });
      setTasksByListId(prevTasks => ({
        ...prevTasks,
        [listId]: [response.result, ...(prevTasks[listId] || [])]
      }));
      setNewTaskTitles(prev => ({ ...prev, [listId]: '' })); // Clear input for this list
      toast({ title: "Task Added", description: `"${response.result.title}" added to ${taskLists.find(l=>l.id === listId)?.title}.` });
    } catch (err: any) {
      console.error('TaskListWidget: Error adding task:', err);
      setErrorPerList(prev => ({ ...prev, [listId]: `Failed to add task: ${err.result?.error?.message || err.message || 'Unknown error'}.`}));
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsAddingTaskForList(prev => ({ ...prev, [listId]: false }));
    }
  };

  const handleToggleTaskCompletion = async (task: Task, listId: string) => {
    if (!accessToken) return;

    const newStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    const originalTasksForList = [...(tasksByListId[listId] || [])];
    
    setTasksByListId(prev => ({
      ...prev,
      [listId]: (prev[listId] || []).map(t => t.id === task.id ? { ...t, status: newStatus } : t)
    }));

    try {
      if (!gapiLoadedRef.current) await loadGapiClient();
      window.gapi.client.setToken({ access_token: accessToken });
      await window.gapi.client.tasks.tasks.update({
        tasklist: listId,
        task: task.id,
        resource: { id: task.id, status: newStatus, title: task.title }, // title is required by API for update
      });
      toast({ title: "Task Updated", description: `"${task.title}" marked as ${newStatus === 'completed' ? 'complete' : 'incomplete'}.`});
       if (newStatus === 'completed') {
        setTimeout(() => {
          setTasksByListId(prev => ({
            ...prev,
            [listId]: (prev[listId] || []).filter(t => t.id !== task.id)
          }));
        }, 1000);
      }
    } catch (err: any) {
      console.error('TaskListWidget: Error updating task:', err);
      setErrorPerList(prev => ({ ...prev, [listId]: `Failed to update task: ${err.result?.error?.message || err.message || 'Unknown error'}.`}));
      setTasksByListId(prev => ({ ...prev, [listId]: originalTasksForList })); // Revert on error
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    }
  };

  const handleCreateTaskList = async () => {
    if (!newTaskListTitle.trim() || !accessToken) return;
    setIsCreatingList(true);
    setError(null);
    try {
      if (!gapiLoadedRef.current) await loadGapiClient();
      window.gapi.client.setToken({ access_token: accessToken });
      const response = await window.gapi.client.tasks.tasklists.insert({
        resource: { title: newTaskListTitle.trim() },
      });
      const newList = response.result;
      toast({ title: "Task List Created", description: `"${newList.title}" created.` });
      setNewTaskListTitle('');
      setTaskLists(prev => [...prev, newList]); // Add to local list
      setVisibleListIds(prev => ({ ...prev, [newList.id]: true })); // Default new list to visible
      if (typeof window !== 'undefined') {
        localStorage.setItem(VISIBLE_LISTS_STORAGE_KEY, JSON.stringify({ ...visibleListIds, [newList.id]: true }));
      }
      fetchAndSetTasksForList(accessToken, newList.id); // Fetch tasks for new list
    } catch (err: any) {
      console.error('TaskListWidget: Error creating task list:', err);
      setError(`Failed to create task list: ${err.result?.error?.message || err.message || 'Unknown error'}.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsCreatingList(false);
    }
  };

  const handleVisibilityChange = (listId: string, checked: boolean) => {
    const newVisibleListIds = { ...visibleListIds, [listId]: checked };
    setVisibleListIds(newVisibleListIds);
    if (typeof window !== 'undefined') {
      localStorage.setItem(VISIBLE_LISTS_STORAGE_KEY, JSON.stringify(newVisibleListIds));
    }
    if (checked && accessToken && !tasksByListId[listId] && !isLoadingTasksForList[listId]) {
      // If made visible and tasks not yet fetched (and not already loading)
      fetchAndSetTasksForList(accessToken, listId);
    }
  };

  const visibleListsToDisplay = taskLists.filter(list => visibleListIds[list.id]);

  return (
      <div className="flex flex-col"> {/* Removed Card to allow multiple cards for lists */}
        <div className="p-4 border-b mb-4"> {/* Header-like section */}
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
        </div>
        
        <div className="px-4 pb-4">
          {!isSignedIn ? (
             <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-muted-foreground mb-4">Sign in to manage your Google Tasks.</p>
                <Button onClick={() => login()} variant="default" disabled={!gapiLoadedRef.current}>
                   {gapiLoadedRef.current ? <LogIn className="mr-2 h-4 w-4" /> : <Loader2 className="mr-2 h-4 w-4 animate-spin" /> }
                   Sign In with Google
                </Button>
                {error && <p className="text-destructive text-sm mt-4 text-center">{error}</p>}
            </div>
          ) : (
            <>
              {error && <Alert variant="destructive" className="mb-4 text-xs"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
              
              {showTaskSettings && (
                <Card className="mb-6 p-4 shadow-md">
                  <CardHeader className="p-2 pt-0">
                    <CardTitle className="text-lg">Task List Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-2">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Visible Task Lists</h4>
                      {isLoadingLists ? (
                        <div className="flex items-center justify-center py-2"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading task lists...</div>
                      ) : taskLists.length > 0 ? (
                        <ScrollArea className="max-h-40 pr-2">
                          <div className="space-y-2">
                          {taskLists.map((list) => (
                            <div key={list.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                              <Label htmlFor={`vis-${list.id}`} className="text-sm text-card-foreground truncate pr-2" title={list.title}>
                                {list.title}
                              </Label>
                              <Switch
                                id={`vis-${list.id}`}
                                checked={!!visibleListIds[list.id]}
                                onCheckedChange={(checked) => handleVisibilityChange(list.id, checked)}
                                aria-label={`Toggle visibility for ${list.title}`}
                              />
                            </div>
                          ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-1">No task lists found. Create one below.</p>
                      )}
                    </div>

                    <Separator />

                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Create New Task List</h4>
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          value={newTaskListTitle}
                          onChange={(e) => setNewTaskListTitle(e.target.value)}
                          placeholder="New list title..."
                          className="flex-grow"
                          onKeyPress={(e) => e.key === 'Enter' && !isCreatingList && handleCreateTaskList()}
                          disabled={isCreatingList}
                        />
                        <Button onClick={handleCreateTaskList} disabled={!newTaskListTitle.trim() || isCreatingList} size="sm">
                          {isCreatingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
                          Create
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Task Display Area for Visible Lists */}
              {isLoadingLists && !taskLists.length ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading your task lists...</div>
              ) : visibleListsToDisplay.length > 0 ? (
                <div className="space-y-6">
                  {visibleListsToDisplay.map(list => (
                    <Card key={list.id} className="shadow-lg flex flex-col">
                      <CardHeader>
                        <CardTitle className="text-md">{list.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2 flex-grow flex flex-col overflow-hidden">
                        <div className="flex gap-2 mb-3">
                          <Input
                            type="text"
                            value={newTaskTitles[list.id] || ''}
                            onChange={(e) => setNewTaskTitles(prev => ({...prev, [list.id]: e.target.value}))}
                            placeholder="Add a task..."
                            className="flex-grow"
                            onKeyPress={(e) => e.key === 'Enter' && !isAddingTaskForList[list.id] && handleAddTask(list.id)}
                            disabled={isAddingTaskForList[list.id]}
                          />
                          <Button 
                            onClick={() => handleAddTask(list.id)} 
                            disabled={!(newTaskTitles[list.id] || '').trim() || isAddingTaskForList[list.id]} 
                            size="sm"
                          >
                            {isAddingTaskForList[list.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                          </Button>
                        </div>
                        {isLoadingTasksForList[list.id] ? (
                           <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tasks for {list.title}...</div>
                        ) : errorPerList[list.id] ? (
                           <Alert variant="destructive" className="text-xs my-2"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{errorPerList[list.id]}</AlertDescription></Alert>
                        ) : (tasksByListId[list.id] || []).length > 0 ? (
                          <ScrollArea className="pr-1 max-h-60 flex-grow">
                            <ul className="space-y-2">
                              {(tasksByListId[list.id] || []).map((task) => (
                                <li key={task.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                                  <Checkbox
                                    id={`task-${list.id}-${task.id}`}
                                    checked={task.status === 'completed'}
                                    onCheckedChange={() => handleToggleTaskCompletion(task, list.id)}
                                    aria-label={`Mark task ${task.title} as ${task.status === 'completed' ? 'incomplete' : 'complete'}`}
                                  />
                                  <label
                                    htmlFor={`task-${list.id}-${task.id}`}
                                    className={`flex-1 text-sm ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}
                                  >
                                    {task.title}
                                  </label>
                                </li>
                              ))}
                            </ul>
                          </ScrollArea>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">No active tasks in this list.</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                 !isLoadingLists && isSignedIn && taskLists.length > 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No task lists are currently visible. Go to settings <Settings className="inline h-3 w-3"/> to select lists to display.</p>
                 )
              )}
               {!isLoadingLists && !taskLists.length && isSignedIn && !error && (
                 <p className="text-sm text-muted-foreground text-center py-4">No Google Task lists found. Click settings <Settings className="inline h-3 w-3"/> to create one.</p>
               )}
            </>
          )}
        </div>
      </div>
  );
};


export function TaskListWidget() {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
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
    return (
       <div className="p-4 border rounded-lg shadow-lg"> {/* Replaced Card with div for outer container */}
        <div className="p-4 border-b"><SectionTitle icon={ListChecks} title="Google Tasks" /></div>
        <div className="p-6"><p className="text-sm text-muted-foreground">Loading Google Tasks...</p></div>
      </div>
    );
  }
  
  if (providerError || !googleClientId) {
    return (
      <div className="p-4 border rounded-lg shadow-lg">
        <div className="p-4 border-b"><SectionTitle icon={ListChecks} title="Google Tasks" /></div>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription>
              {providerError || "Google Client ID is not available. Please configure it."}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <TaskListContent />
    </GoogleOAuthProvider>
  );
}
