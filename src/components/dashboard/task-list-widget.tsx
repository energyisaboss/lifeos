
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
import { ListChecks, LogIn, LogOut, PlusCircle, Loader2, AlertCircle, Settings, ListPlus, Edit3, Check, XCircle, Palette } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from '@/components/ui/separator';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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

interface TaskListSetting {
  visible: boolean;
  color: string;
}

const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
const TASK_LIST_SETTINGS_STORAGE_KEY = 'googleTaskListSettings_v2'; // Updated key for new color input

const predefinedTaskColors: string[] = [
  '#F44336', // Red
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#FFEB3B', // Yellow
  '#4CAF50', // Green
  '#9C27B0', // Purple
];
let lastAssignedColorIndex = -1;

const getNextColor = () => {
  lastAssignedColorIndex = (lastAssignedColorIndex + 1) % predefinedTaskColors.length;
  return predefinedTaskColors[lastAssignedColorIndex];
};

const isValidHexColor = (color: string) => {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}


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
  const [listSettings, setListSettings] = useState<Record<string, TaskListSetting>>(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem(TASK_LIST_SETTINGS_STORAGE_KEY);
      if (savedSettings) {
        try {
          const parsedSettings = JSON.parse(savedSettings);
          if (typeof parsedSettings === 'object' && parsedSettings !== null) {
            // Ensure all loaded settings have a color property
            Object.keys(parsedSettings).forEach(key => {
              if (parsedSettings[key] && !parsedSettings[key].color) {
                parsedSettings[key].color = getNextColor(); 
              }
            });
            return parsedSettings;
          } else {
            console.warn("TaskListWidget: Parsed list settings from localStorage is not an object, ignoring.");
            localStorage.removeItem(TASK_LIST_SETTINGS_STORAGE_KEY);
          }
        } catch (e) {
          console.error("TaskListWidget: Failed to parse list settings from localStorage", e);
          localStorage.removeItem(TASK_LIST_SETTINGS_STORAGE_KEY); 
        }
      }
    }
    return {};
  });
  
  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>({});
  const [newTaskListTitle, setNewTaskListTitle] = useState('');

  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isLoadingTasksForList, setIsLoadingTasksForList] = useState<Record<string, boolean>>({});
  const [isAddingTaskForList, setIsAddingTaskForList] = useState<Record<string, boolean>>({});
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPerList, setErrorPerList] = useState<Record<string, string | null>>({});
  const [showTaskSettings, setShowTaskSettings] = useState(false);
  
  const [isGapiClientLoaded, setIsGapiClientLoaded] = useState(false);

  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListTitle, setEditingListTitle] = useState('');
  const [isUpdatingListTitle, setIsUpdatingListTitle] = useState(false);


  useEffect(() => {
    if (typeof window !== 'undefined' && Object.keys(listSettings).length > 0) {
      localStorage.setItem(TASK_LIST_SETTINGS_STORAGE_KEY, JSON.stringify(listSettings));
    }
  }, [listSettings]);


  const loadGapiClient = useCallback(async () => {
    if (isGapiClientLoaded && window.gapi && window.gapi.client && window.gapi.client.tasks) {
      console.log('TaskListWidget: GAPI client and Tasks API already confirmed loaded.');
      return;
    }
    console.log('TaskListWidget: Attempting to load GAPI client...');
    return new Promise<void>((resolve, reject) => {
      if (window.gapi && window.gapi.client && window.gapi.client.tasks) {
        console.log('TaskListWidget: GAPI client and Tasks API found on window, assuming loaded.');
        setIsGapiClientLoaded(true);
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({}); 
            console.log('TaskListWidget: GAPI client initialized.');
            await window.gapi.client.load('https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest');
            console.log('TaskListWidget: Google Tasks API discovered.');
            setIsGapiClientLoaded(true);
            resolve();
          } catch (initError: any) {
            const message = `Error initializing GAPI client or Tasks API: ${initError?.message || String(initError)}`;
            console.error(`TaskListWidget: ${message}`, initError);
            setError(message); 
            setIsGapiClientLoaded(false);
            reject(new Error(message)); 
          }
        });
      };
      script.onerror = (event: Event | string) => {
         const message = `Error loading GAPI script: ${typeof event === 'string' ? event : (event instanceof Event && event.type ? event.type : 'Unknown script load error')}`;
         console.error(`TaskListWidget: ${message}`, event);
         setError(message);
         setIsGapiClientLoaded(false);
         reject(new Error(message));
      }
      document.body.appendChild(script);
    });
  }, [isGapiClientLoaded, setError]);


  const handleSignOut = useCallback(() => {
    googleLogout();
    setAccessToken(null);
    setIsSignedIn(false);
    setTaskLists([]);
    setTasksByListId({});
    // setListSettings({}); // User might prefer settings persist
    setShowTaskSettings(false);
    setError(null);
    setErrorPerList({});
    setIsGapiClientLoaded(false); 
    setEditingListId(null);
    setEditingListTitle('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('googleTasksAccessToken');
    }
    if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken(null);
    }
    console.log('TaskListWidget: Signed out.');
  }, []);

  const fetchAndSetTasksForList = useCallback(async (token: string, listId: string) => {
    if (!token || !listId) return;
    console.log(`TaskListWidget: Fetching tasks for list ${listId}`);
    setIsLoadingTasksForList(prev => ({ ...prev, [listId]: true }));
    setErrorPerList(prev => ({ ...prev, [listId]: null }));

    try {
      if (!isGapiClientLoaded) {
        console.warn(`TaskListWidget: GAPI client not loaded, attempting to load before fetching tasks for list ${listId}.`);
        await loadGapiClient();
      }
      if (!window.gapi || !window.gapi.client || !window.gapi.client.tasks) {
        throw new Error("Google Tasks API client is not available (fetchAndSetTasksForList).");
      }
      window.gapi.client.setToken({ access_token: token });
      const response = await window.gapi.client.tasks.tasks.list({
        tasklist: listId,
        showCompleted: false,
        showHidden: false,
        maxResults: 100,
      });
      console.log(`TaskListWidget: Raw response from tasks.list() for list ${listId}:`, JSON.stringify(response, null, 2));
      setTasksByListId(prev => ({ ...prev, [listId]: response?.result?.items || [] }));
    } catch (err: any) {
      console.error(`TaskListWidget: Error fetching tasks for list ${listId}:`, err);
      setErrorPerList(prev => ({ ...prev, [listId]: `Failed to fetch tasks: ${err.message || err.result?.error?.message || 'Unknown error'}.`}));
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsLoadingTasksForList(prev => ({ ...prev, [listId]: false }));
    }
  }, [isGapiClientLoaded, loadGapiClient, handleSignOut]);

  const fetchTaskLists = useCallback(async (token: string) => {
    if (!token) return;
    setIsLoadingLists(true);
    setError(null);
    console.log('TaskListWidget: Attempting to fetch task lists.');
    try {
      if (!isGapiClientLoaded) {
        console.warn('TaskListWidget: GAPI client not loaded, attempting to load before fetching task lists.');
        await loadGapiClient();
      }
      if (!window.gapi || !window.gapi.client || !window.gapi.client.tasks) {
        throw new Error("Google Tasks API client is not available for fetching lists.");
      }
      window.gapi.client.setToken({ access_token: token });
      const response = await window.gapi.client.tasks.tasklists.list();
      console.log('TaskListWidget: Raw response from tasklists.list():', JSON.stringify(response, null, 2));

      const fetchedLists: TaskList[] = response?.result?.items || [];
      console.log(`TaskListWidget: Fetched ${fetchedLists.length} task lists from API.`);
      setTaskLists(fetchedLists);

      setListSettings(prevSettings => {
        const newSettings = {...prevSettings};
        let settingsChanged = false;
        let newListsMadeVisible = false;
        
        fetchedLists.forEach((list, index) => {
            if (!newSettings[list.id]) {
                const isFirstList = Object.keys(newSettings).length === 0 && index === 0;
                newSettings[list.id] = {
                    visible: isFirstList, // Make only the very first list visible by default
                    color: getNextColor() 
                };
                settingsChanged = true;
                if (isFirstList) newListsMadeVisible = true;
            } else if (!newSettings[list.id].color) { // Ensure existing entries have a color
                newSettings[list.id].color = newSettings[list.id].color || getNextColor();
                settingsChanged = true;
            }
        });
        if (settingsChanged && typeof window !== 'undefined') {
            localStorage.setItem(TASK_LIST_SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
        }
        if (newListsMadeVisible && accessToken && isGapiClientLoaded) {
           fetchedLists.forEach(list => {
             if(newSettings[list.id]?.visible && !tasksByListId[list.id] && !isLoadingTasksForList[list.id]) {
                 fetchAndSetTasksForList(accessToken, list.id);
             }
           });
        }
        return newSettings;
      });
      
    } catch (err: any) {
      console.error('TaskListWidget: Error fetching task lists:', err);
      const errorMessage = `Failed to fetch task lists: ${err.result?.error?.message || err.message || 'Unknown error'}. Try signing out and in again.`;
      setError(errorMessage);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsLoadingLists(false);
    }
  }, [isGapiClientLoaded, loadGapiClient, handleSignOut, accessToken, tasksByListId, isLoadingTasksForList, fetchAndSetTasksForList]); 

  useEffect(() => {
    if (!isSignedIn && accessToken) { 
      setAccessToken(null);
      if (typeof window !== 'undefined') localStorage.removeItem('googleTasksAccessToken');
    }
    if (isSignedIn || accessToken) { 
       loadGapiClient().catch(e => console.error("TaskListWidget: Failed to load GAPI on mount/auth change", e));
    }
  }, [isSignedIn, accessToken, loadGapiClient]);

  useEffect(() => {
    if (accessToken && isSignedIn && isGapiClientLoaded) {
      console.log("TaskListWidget: Conditions met to fetch task lists (token, signedIn, GAPI loaded).");
      fetchTaskLists(accessToken);
    } else {
      console.log("TaskListWidget: Conditions NOT met to fetch task lists.", {accessToken: !!accessToken, isSignedIn, isGapiClientLoaded});
    }
  }, [accessToken, isSignedIn, isGapiClientLoaded, fetchTaskLists]);

  useEffect(() => {
    if (accessToken && isGapiClientLoaded && taskLists.length > 0) {
        taskLists.forEach(list => {
            if (listSettings[list.id]?.visible && !tasksByListId[list.id] && !isLoadingTasksForList[list.id]) {
                fetchAndSetTasksForList(accessToken, list.id);
            }
        });
    }
  }, [listSettings, accessToken, isGapiClientLoaded, taskLists, tasksByListId, isLoadingTasksForList, fetchAndSetTasksForList]);


  const handleLoginSuccess = (tokenResponse: Omit<TokenResponse, 'error' | 'error_description' | 'error_uri'>) => {
    const newAccessToken = tokenResponse.access_token;
    setAccessToken(newAccessToken);
    setIsSignedIn(true);
    if (typeof window !== 'undefined') localStorage.setItem('googleTasksAccessToken', newAccessToken);
    console.log('TaskListWidget: Login successful, token acquired.');
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
      if (!isGapiClientLoaded) await loadGapiClient();
      if (!window.gapi || !window.gapi.client || !window.gapi.client.tasks) {
        throw new Error("Google Tasks API client is not available for adding task.");
      }
      window.gapi.client.setToken({ access_token: accessToken });
      const response = await window.gapi.client.tasks.tasks.insert({
        tasklist: listId,
        resource: { title },
      });
      setTasksByListId(prevTasks => ({
        ...prevTasks,
        [listId]: [response.result, ...(prevTasks[listId] || [])]
      }));
      setNewTaskTitles(prev => ({ ...prev, [listId]: '' }));
      toast({ title: "Task Added", description: `"${response.result.title}" added to ${taskLists.find(l=>l.id === listId)?.title}.` });
    } catch (err: any) {
      console.error('TaskListWidget: Error adding task:', err);
      setErrorPerList(prev => ({ ...prev, [listId]: `Failed to add task: ${err.message || err.result?.error?.message || 'Unknown error'}.`}));
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
      if (!isGapiClientLoaded) await loadGapiClient();
       if (!window.gapi || !window.gapi.client || !window.gapi.client.tasks) {
        throw new Error("Google Tasks API client is not available for updating task.");
      }
      window.gapi.client.setToken({ access_token: accessToken });
      await window.gapi.client.tasks.tasks.update({
        tasklist: listId,
        task: task.id,
        resource: { id: task.id, status: newStatus, title: task.title },
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
      setErrorPerList(prev => ({ ...prev, [listId]: `Failed to update task: ${err.message || err.result?.error?.message || 'Unknown error'}.`}));
      setTasksByListId(prev => ({ ...prev, [listId]: originalTasksForList }));
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    }
  };

  const handleCreateTaskList = async () => {
    if (!newTaskListTitle.trim() || !accessToken) return;
    setIsCreatingList(true);
    setError(null);
    try {
      if (!isGapiClientLoaded) await loadGapiClient();
      if (!window.gapi || !window.gapi.client || !window.gapi.client.tasks) {
        throw new Error("Google Tasks API client is not available for creating list.");
      }
      window.gapi.client.setToken({ access_token: accessToken });
      const response = await window.gapi.client.tasks.tasklists.insert({
        resource: { title: newTaskListTitle.trim() },
      });
      const newList = response.result;
      toast({ title: "Task List Created", description: `"${newList.title}" created.` });
      setNewTaskListTitle('');
      
      setListSettings(prevSettings => {
        const newSettings = {
            ...prevSettings,
            [newList.id]: { visible: true, color: getNextColor() }
        };
        if (typeof window !== 'undefined') {
            localStorage.setItem(TASK_LIST_SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
        }
        return newSettings;
      });
      setTaskLists(prev => [...prev, newList]); 
      if (accessToken) fetchAndSetTasksForList(accessToken, newList.id);

    } catch (err: any) {
      console.error('TaskListWidget: Error creating task list:', err);
      setError(`Failed to create task list: ${err.message || err.result?.error?.message || 'Unknown error'}.`);
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsCreatingList(false);
    }
  };

  const handleListSettingChange = (listId: string, key: keyof TaskListSetting, value: boolean | string) => {
    setListSettings(prev => {
        const newSettings = {
            ...prev,
            [listId]: {
                ...(prev[listId] || { visible: false, color: getNextColor() }), 
                [key]: value
            }
        };
        if (key === 'color' && typeof value === 'string' && !isValidHexColor(value) && value !== '') {
            // If hex is partially typed but invalid, don't toast yet, let them finish typing
            // If it's invalid upon trying to apply fully (e.g. on blur or button), we'd add toast there
        } else if (key === 'color' && typeof value === 'string' && value !== '' && !isValidHexColor(value)) {
            toast({ title: "Invalid Color", description: "Please enter a valid hex color code (e.g. #RRGGBB).", variant: "destructive" });
            // Optionally revert to previous color or keep invalid input until corrected
        }
        
        if (key === 'visible' && value === true && accessToken && !tasksByListId[listId] && !isLoadingTasksForList[listId] && isGapiClientLoaded) {
          fetchAndSetTasksForList(accessToken, listId);
        }
        return newSettings;
    });
  };

  const handleStartEditListTitle = (list: TaskList) => {
    setEditingListId(list.id);
    setEditingListTitle(list.title);
  };

  const handleCancelEditListTitle = () => {
    setEditingListId(null);
    setEditingListTitle('');
  };

  const handleSaveListTitle = async () => {
    if (!editingListId || !editingListTitle.trim() || !accessToken) return;
    setIsUpdatingListTitle(true);
    try {
      if (!isGapiClientLoaded) await loadGapiClient();
      if (!window.gapi || !window.gapi.client || !window.gapi.client.tasks) {
        throw new Error("Google Tasks API client is not available for updating list title.");
      }
      window.gapi.client.setToken({ access_token: accessToken });
      const response = await window.gapi.client.tasks.tasklists.update({
        tasklist: editingListId,
        resource: { id: editingListId, title: editingListTitle.trim() },
      });
      setTaskLists(prev => prev.map(list => list.id === editingListId ? response.result : list));
      toast({ title: "Task List Updated", description: `List name changed to "${response.result.title}".` });
      handleCancelEditListTitle();
    } catch (err: any) {
      console.error('TaskListWidget: Error updating task list title:', err);
      toast({ title: "Update Failed", description: `Could not update list title: ${err.message || err.result?.error?.message || 'Unknown Error'}`, variant: "destructive" });
      if (err.status === 401 || err.result?.error?.status === 'UNAUTHENTICATED') handleSignOut();
    } finally {
      setIsUpdatingListTitle(false);
    }
  };

  const visibleListsToDisplay = taskLists.filter(list => listSettings[list.id]?.visible);

  return (
    <>
      <div className="p-4 border-b mb-1">
        <div className="flex justify-between items-center">
          <SectionTitle icon={ListChecks} title="Tasks" className="mb-0" />
          <div className="flex items-center gap-1">
            {isSignedIn && (
              <Button variant="ghost" size="sm" onClick={() => setShowTaskSettings(!showTaskSettings)} aria-label="Task Settings">
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <div className="px-4 pb-4">
        {!isSignedIn ? (
           <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground mb-4">Sign in to manage your Google Tasks.</p>
              <Button onClick={() => login()} variant="default" disabled={!isGapiClientLoaded}>
                 {!isGapiClientLoaded ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" /> }
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
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Visible Task Lists & Colors</h4>
                    {isLoadingLists ? (
                      <div className="flex items-center justify-center py-2"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading task lists...</div>
                    ) : taskLists.length > 0 ? (
                      <ScrollArea className="max-h-48 pr-2">
                        <div className="space-y-3">
                        {taskLists.map((list) => (
                          <div key={list.id} className="p-2.5 rounded-md bg-muted/30 hover:bg-muted/50">
                            <div className="flex items-center justify-between mb-1.5">
                              {editingListId === list.id ? (
                                <div className="flex-grow flex items-center gap-1">
                                  <Input
                                    type="text"
                                    value={editingListTitle}
                                    onChange={(e) => setEditingListTitle(e.target.value)}
                                    className="h-8 text-sm flex-grow"
                                    onKeyDown={(e) => e.key === 'Enter' && !isUpdatingListTitle && handleSaveListTitle()}
                                    disabled={isUpdatingListTitle}
                                    autoFocus
                                  />
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveListTitle} disabled={isUpdatingListTitle || !editingListTitle.trim()} aria-label="Save list title">
                                    {isUpdatingListTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEditListTitle} disabled={isUpdatingListTitle} aria-label="Cancel editing list title">
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Label htmlFor={`vis-${list.id}`} className="text-sm text-card-foreground truncate pr-1" title={list.title}>
                                  {list.title}
                                </Label>
                              )}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {editingListId !== list.id && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEditListTitle(list)} aria-label="Edit list title">
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Switch
                                  id={`vis-${list.id}`}
                                  checked={!!listSettings[list.id]?.visible}
                                  onCheckedChange={(checked) => handleListSettingChange(list.id, 'visible', checked)}
                                  aria-label={`Toggle visibility for ${list.title}`}
                                  disabled={editingListId === list.id}
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                               <Palette size={16} className="mr-1 text-muted-foreground" />
                              {predefinedTaskColors.map(colorOption => (
                                <button
                                  key={colorOption}
                                  type="button"
                                  title={colorOption}
                                  className={cn(
                                    "w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                    listSettings[list.id]?.color === colorOption ? "border-foreground" : "border-transparent hover:border-muted-foreground/50"
                                  )}
                                  style={{ backgroundColor: colorOption }}
                                  onClick={() => handleListSettingChange(list.id, 'color', colorOption)}
                                />
                              ))}
                              <Input
                                type="text"
                                placeholder="#HEX"
                                value={listSettings[list.id]?.color || ''}
                                onChange={(e) => handleListSettingChange(list.id, 'color', e.target.value)}
                                className={cn(
                                    "h-7 w-20 text-xs",
                                    listSettings[list.id]?.color && !isValidHexColor(listSettings[list.id]?.color) && listSettings[list.id]?.color !== '' ? "border-destructive focus-visible:ring-destructive" : ""
                                )}
                                maxLength={7}
                              />
                            </div>
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
                        className="flex-grow h-9 text-sm"
                        onKeyPress={(e) => e.key === 'Enter' && !isCreatingList && handleCreateTaskList()}
                        disabled={isCreatingList}
                      />
                      <Button onClick={handleCreateTaskList} disabled={!newTaskListTitle.trim() || isCreatingList} size="sm" className="h-9">
                        {isCreatingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
                        Create
                      </Button>
                    </div>
                  </div>
                  <Separator />
                   <div className="flex justify-center mt-4">
                      <Button variant="outline" size="sm" onClick={handleSignOut}>
                          <LogOut className="mr-2 h-4 w-4" /> Sign Out
                      </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {isLoadingLists && !taskLists.length && !showTaskSettings ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading your task lists...</div>
            ) : visibleListsToDisplay.length > 0 ? (
              <div className="space-y-4 mt-4">
                {visibleListsToDisplay.map(list => (
                  <Card 
                    key={list.id} 
                    className="shadow-md flex flex-col"
                    style={{ borderTop: `4px solid ${listSettings[list.id]?.color || predefinedTaskColors[0]}` }}
                  >
                    <CardHeader className="py-3 px-4 border-b">
                      <CardTitle className="text-md">{list.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 px-4 pb-3 flex-grow flex flex-col overflow-hidden">
                      <div className="flex gap-2 mb-3">
                        <Input
                          type="text"
                          value={newTaskTitles[list.id] || ''}
                          onChange={(e) => setNewTaskTitles(prev => ({...prev, [list.id]: e.target.value}))}
                          placeholder="Add a task..."
                          className="flex-grow h-9 text-sm"
                          onKeyPress={(e) => e.key === 'Enter' && !isAddingTaskForList[list.id] && handleAddTask(list.id)}
                          disabled={isAddingTaskForList[list.id]}
                        />
                        <Button 
                          onClick={() => handleAddTask(list.id)} 
                          disabled={!(newTaskTitles[list.id] || '').trim() || isAddingTaskForList[list.id]} 
                          size="sm"
                          className="h-9"
                        >
                          {isAddingTaskForList[list.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                        </Button>
                      </div>
                      {isLoadingTasksForList[list.id] ? (
                         <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tasks...</div>
                      ) : errorPerList[list.id] ? (
                         <Alert variant="destructive" className="text-xs my-2"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{errorPerList[list.id]}</AlertDescription></Alert>
                      ) : (tasksByListId[list.id] || []).length > 0 ? (
                        <ScrollArea className="pr-1 flex-grow max-h-60">
                          <ul className="space-y-1.5">
                            {(tasksByListId[list.id] || []).map((task) => (
                              <li key={task.id} className="flex items-center space-x-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors">
                                <Checkbox
                                  id={`task-${list.id}-${task.id}`}
                                  checked={task.status === 'completed'}
                                  onCheckedChange={() => handleToggleTaskCompletion(task, list.id)}
                                  aria-label={`Mark task ${task.title} as ${task.status === 'completed' ? 'incomplete' : 'complete'}`}
                                />
                                <label
                                  htmlFor={`task-${list.id}-${task.id}`}
                                  className={`flex-1 text-sm cursor-pointer ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}
                                >
                                  {task.title}
                                </label>
                              </li>
                            ))}
                          </ul>
                        </ScrollArea>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-3">No active tasks in this list.</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
               !isLoadingLists && isSignedIn && taskLists.length > 0 && !showTaskSettings && (
                <p className="text-sm text-muted-foreground text-center py-6">No task lists are currently visible. Go to settings <Settings className="inline h-3 w-3"/> to select lists to display.</p>
               )
            )}
             {!isLoadingLists && !taskLists.length && isSignedIn && !error && !showTaskSettings && (
               <p className="text-sm text-muted-foreground text-center py-6">No Google Task lists found. Click settings <Settings className="inline h-3 w-3"/> to create one.</p>
             )}
          </>
        )}
      </div>
    </>
  );
};


export function TaskListWidget() {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true); 
    const clientIdFromEnv = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (clientIdFromEnv) {
      setGoogleClientId(clientIdFromEnv);
    } else {
      console.error("TaskListWidget: NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set in .env.local or not exposed to client.");
      setProviderError("Google Client ID not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env.local file, ensure it's exposed to the client (prefixed with NEXT_PUBLIC_), and restart the server.");
    }
  }, []);

  if (!isClient) {
    return (
       <div className="flex flex-col">
        <div className="p-4 border-b mb-1"><SectionTitle icon={ListChecks} title="Tasks" /></div>
        <div className="px-4 pb-4">
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-8 w-full mb-2" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }
  
  if (providerError || !googleClientId) {
    return (
      <div className="flex flex-col">
        <div className="p-4 border-b mb-1"><SectionTitle icon={ListChecks} title="Tasks" /></div>
        <div className="px-4 pb-4">
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
