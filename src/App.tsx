/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eye,
  Plus, 
  Trash2, 
  ChevronRight, 
  Calendar, 
  User, 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  LayoutDashboard,
  Pencil,
  ArrowLeft,
  Download,
  LogOut,
  ShieldCheck,
  UserCheck,
  RefreshCw,
  Sparkles,
  Book,
  GraduationCap,
  Backpack,
  Calculator,
  Library,
  Brain,
  School,
  LogIn,
  Upload,
  Image as ImageIcon,
  Loader2,
  X,
  Moon,
  Sun
} from 'lucide-react';
import { Day, TimeSlot, Course, UserProfile, Schedule, Section } from './types';
import { extractCoursesFromImages } from './services/geminiService';
// @ts-ignore
import html2pdf from 'html2pdf.js';

// Constants
const SEMESTERS = Array.from({ length: 8 }, (_, i) => i + 1);
const DAYS = Object.values(Day);
const COURSE_COLORS = [
  'bg-stone-500', 'bg-emerald-800', 'bg-stone-900', 
  'bg-rose-900', 'bg-stone-600', 'bg-orange-800', 
  'bg-teal-800', 'bg-emerald-950'
];

const AVATAR_ICONS = [
  { id: 'book', icon: Book, label: 'Literature', color: 'text-stone-600 bg-stone-50' },
  { id: 'grad', icon: GraduationCap, label: 'Degree', color: 'text-emerald-900 bg-emerald-50' },
  { id: 'pencil', icon: Pencil, label: 'Research', color: 'text-zinc-600 bg-zinc-50' },
  { id: 'brain', icon: Brain, label: 'Analysis', color: 'text-rose-900 bg-rose-50' },
  { id: 'calc', icon: Calculator, label: 'Methodology', color: 'text-stone-400 bg-stone-50' },
  { id: 'pack', icon: Backpack, label: 'Fieldwork', color: 'text-emerald-800 bg-emerald-50' },
  { id: 'library', icon: Library, label: 'Archives', color: 'text-stone-900 bg-stone-100' },
  { id: 'school', icon: School, label: 'Campus', color: 'text-emerald-950 bg-emerald-100' },
];

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'profile' | 'login' | 'user_selection' | 'courses' | 'course_summary' | 'results' | 'final_view'>('landing');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [results, setResults] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Helper to safely parse storage with fallback
  const safeGetStorage = <T,>(key: string, fallbackKey?: string): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (raw && raw !== 'undefined' && raw !== 'null') {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) ? parsed.length > 0 : parsed !== null) return parsed;
      }
      if (fallbackKey) {
        const fallbackRaw = localStorage.getItem(fallbackKey);
        if (fallbackRaw && fallbackRaw !== 'undefined' && fallbackRaw !== 'null') {
          const parsed = JSON.parse(fallbackRaw);
          if (Array.isArray(parsed) ? parsed.length > 0 : parsed !== null) return parsed;
        }
      }
    } catch (e) {
      console.warn("Storage parse error", key, e);
    }
    return null;
  };

  // Load from LocalStorage on mount
  useEffect(() => {
    try {
      const savedUsersList = localStorage.getItem('timetable_users');
      const savedUserId = localStorage.getItem('timetable_active_user_id');
      const savedLogin = localStorage.getItem('timetable_is_logged_in');
      const savedDarkMode = localStorage.getItem('timetable_dark_mode');
      const savedScreen = localStorage.getItem('timetable_screen');
      
      const parsedUsers: UserProfile[] = savedUsersList ? JSON.parse(savedUsersList) : [];
      setUsers(parsedUsers);

      if (savedDarkMode === 'true') {
        setDarkMode(true);
      }
      
      const activeUser = (savedUserId && parsedUsers.find(u => u.id === savedUserId)) || (parsedUsers.length > 0 ? parsedUsers[0] : null);

      if (activeUser) {
        setUser(activeUser);

        // Load courses safely
        const loadedCourses = safeGetStorage<any[]>(`timetable_courses_${activeUser.id}`, 'timetable_courses');
        let initialCourses: Course[] = [];
        if (loadedCourses && loadedCourses.length > 0) {
          initialCourses = loadedCourses.map((c) => {
            let updatedCourse = { ...c };
            if (c.slots && !c.sections) {
              updatedCourse.sections = [{ id: 'default', name: 'Original Section', slots: c.slots }];
              delete (updatedCourse as any).slots;
            }
            return updatedCourse;
          });
          setCourses(initialCourses);
        }

        // Load solutions / results safely
        const loadedResults = safeGetStorage<Schedule[]>(`timetable_results_${activeUser.id}`, 'timetable_results');
        if (loadedResults && loadedResults.length > 0) {
          setResults(loadedResults);
        }

        // Load selected finalized schedule safely
        const loadedSelected = safeGetStorage<Schedule>(`timetable_selected_schedule_${activeUser.id}`, 'timetable_selected_schedule');
        if (loadedSelected) {
          setSelectedSchedule(loadedSelected);
        }

        if (savedLogin === 'true') {
          setIsLoggedIn(true);

          if (savedScreen && ['courses', 'course_summary', 'results', 'final_view'].includes(savedScreen)) {
            if (savedScreen === 'final_view' && !loadedSelected) {
              setScreen(loadedResults && loadedResults.length > 0 ? 'results' : 'courses');
            } else {
              setScreen(savedScreen as any);
            }
          } else if (loadedSelected) {
            setScreen('final_view');
          } else if (loadedResults && loadedResults.length > 0) {
            setScreen('results');
          } else {
            setScreen('courses');
          }
        } else {
          setScreen('landing');
        }
      } else {
        setScreen('landing');
      }
      
      setDataLoaded(true);
    } catch (e) {
      console.error("Failed to load saved data", e);
      setDataLoaded(true);
    }
  }, []);

  // Save changes safely without overwriting non-empty storage with empty states
  useEffect(() => {
    if (!dataLoaded) return;

    if (users.length > 0) {
      localStorage.setItem('timetable_users', JSON.stringify(users));
    }
    
    if (user && isLoggedIn) {
      localStorage.setItem('timetable_active_user_id', user.id);

      if (courses.length > 0) {
        localStorage.setItem(`timetable_courses_${user.id}`, JSON.stringify(courses));
        localStorage.setItem('timetable_courses', JSON.stringify(courses));
      }

      if (results.length > 0) {
        localStorage.setItem(`timetable_results_${user.id}`, JSON.stringify(results));
        localStorage.setItem('timetable_results', JSON.stringify(results));
      }

      if (selectedSchedule) {
        localStorage.setItem(`timetable_selected_schedule_${user.id}`, JSON.stringify(selectedSchedule));
        localStorage.setItem('timetable_selected_schedule', JSON.stringify(selectedSchedule));
      }

      localStorage.setItem('timetable_is_logged_in', 'true');
    } else if (!isLoggedIn && dataLoaded) {
      localStorage.setItem('timetable_is_logged_in', 'false');
    }

    localStorage.setItem('timetable_dark_mode', darkMode.toString());
    if (isLoggedIn && ['courses', 'course_summary', 'results', 'final_view'].includes(screen)) {
      localStorage.setItem('timetable_screen', screen);
    }
  }, [users, user, courses, results, selectedSchedule, isLoggedIn, dataLoaded, darkMode, screen]);

  const handleAuth = (data: UserProfile) => {
    let existingIndex = -1;
    if (data.id) {
      existingIndex = users.findIndex(u => u.id === data.id);
    }
    if (existingIndex === -1 && data.name) {
      existingIndex = users.findIndex(
        u => u.name.trim().toLowerCase() === data.name.trim().toLowerCase()
      );
    }

    let updatedUsers = [...users];
    let finalUser: UserProfile;

    if (existingIndex > -1) {
      updatedUsers[existingIndex] = { ...data, id: users[existingIndex].id };
      finalUser = updatedUsers[existingIndex];
    } else {
      const newUser = { ...data, id: data.id || Math.random().toString(36).substring(2, 11) };
      updatedUsers.push(newUser);
      finalUser = newUser;
    }

    setUsers(updatedUsers);
    setUser(finalUser);
    
    // Load courses for this user if they exist
    const savedCourses = safeGetStorage<any[]>(`timetable_courses_${finalUser.id}`, 'timetable_courses');
    if (savedCourses && savedCourses.length > 0) {
      const migrated = savedCourses.map((c: any) => {
        if (c.slots && !c.sections) {
          return { ...c, sections: [{ id: 'default', name: 'Original Section', slots: c.slots }] };
        }
        return c;
      });
      setCourses(migrated);
    }

    // Load results and selected schedule
    const savedResults = safeGetStorage<Schedule[]>(`timetable_results_${finalUser.id}`, 'timetable_results');
    if (savedResults && savedResults.length > 0) {
      setResults(savedResults);
    }

    const savedSelectedSchedule = safeGetStorage<Schedule>(`timetable_selected_schedule_${finalUser.id}`, 'timetable_selected_schedule');
    if (savedSelectedSchedule) {
      setSelectedSchedule(savedSelectedSchedule);
    }

    setIsLoggedIn(true);
    if (savedSelectedSchedule) {
      setScreen('final_view');
    } else {
      setScreen('courses');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.setItem('timetable_is_logged_in', 'false');
    localStorage.removeItem('timetable_screen');
    setScreen('landing');
  };

  const handleLandingChoice = (type: 'new' | 'returning') => {
    if (type === 'new') {
      setUser(null);
      setIsLoggedIn(false);
      setScreen('profile');
    } else {
      if (users.length === 0) {
        alert("No existing student profiles found. Please start as a new student.");
        return;
      }
      
      if (users.length > 1) {
        setScreen('user_selection');
      } else {
        const returningUser = users[0];
        setUser(returningUser);
        
        // Load courses for this user
        const savedCourses = safeGetStorage<any[]>(`timetable_courses_${returningUser.id}`, 'timetable_courses');
        if (savedCourses && savedCourses.length > 0) {
          const migrated = savedCourses.map((c: any) => {
            if (c.slots && !c.sections) {
              return { ...c, sections: [{ id: 'default', name: 'Original Section', slots: c.slots }] };
            }
            return c;
          });
          setCourses(migrated);
        }
        
        // Load results and selected schedule
        const savedResults = safeGetStorage<Schedule[]>(`timetable_results_${returningUser.id}`, 'timetable_results');
        if (savedResults && savedResults.length > 0) {
          setResults(savedResults);
        }

        const savedSelectedSchedule = safeGetStorage<Schedule>(`timetable_selected_schedule_${returningUser.id}`, 'timetable_selected_schedule');
        if (savedSelectedSchedule) {
          setSelectedSchedule(savedSelectedSchedule);
        }
        
        setScreen('login');
      }
    }
  };

  const handleSelectUser = (u: UserProfile) => {
    setUser(u);
    
    // Load courses for this user
    const savedCourses = safeGetStorage<any[]>(`timetable_courses_${u.id}`, 'timetable_courses');
    if (savedCourses && savedCourses.length > 0) {
      const migrated = savedCourses.map((c: any) => {
        if (c.slots && !c.sections) {
          return { ...c, sections: [{ id: 'default', name: 'Original Section', slots: c.slots }] };
        }
        return c;
      });
      setCourses(migrated);
    }
    
    // Load results and selected schedule
    const savedResults = safeGetStorage<Schedule[]>(`timetable_results_${u.id}`, 'timetable_results');
    if (savedResults && savedResults.length > 0) {
      setResults(savedResults);
    }

    const savedSelectedSchedule = safeGetStorage<Schedule>(`timetable_selected_schedule_${u.id}`, 'timetable_selected_schedule');
    if (savedSelectedSchedule) {
      setSelectedSchedule(savedSelectedSchedule);
    }
    
    setScreen('login');
  };

  const handleDeleteUser = (userId: string) => {
    const updatedUsers = users.filter(u => u.id !== userId);
    setUsers(updatedUsers);
    localStorage.removeItem(`timetable_courses_${userId}`);
    localStorage.removeItem(`timetable_results_${userId}`);
    localStorage.removeItem(`timetable_selected_schedule_${userId}`);
    
    if (user?.id === userId) {
      setUser(null);
      setCourses([]);
      setResults([]);
      setSelectedSchedule(null);
      setIsLoggedIn(false);
    }
    
    if (updatedUsers.length === 0) {
      localStorage.removeItem('timetable_users');
      setScreen('landing');
    } else {
      setScreen('user_selection');
    }
  };

  const generateSchedules = () => {
    if (courses.length === 0) return;

    // Helper to check if two time slots clash
    const isClashing = (slot1: TimeSlot, slot2: TimeSlot) => {
      if (slot1.day !== slot2.day) return false;
      
      const start1 = slot1.startTime;
      const end1 = slot1.endTime;
      const start2 = slot2.startTime;
      const end2 = slot2.endTime;

      return start1 < end2 && start2 < end1;
    };

    // Helper to check if a choice of sections has clashes
    const hasClashes = (selectedSections: { course: Course; section: Section }[]) => {
      const allSlots: { courseName: string; slot: TimeSlot }[] = [];
      for (const item of selectedSections) {
        for (const slot of item.section.slots) {
          allSlots.push({ courseName: item.course.name, slot });
        }
      }

      for (let i = 0; i < allSlots.length; i++) {
        for (let j = i + 1; j < allSlots.length; j++) {
          if (isClashing(allSlots[i].slot, allSlots[j].slot)) {
            return true;
          }
        }
      }
      return false;
    };

    // Cartesian product of course sections - Recursive backtracking
    const shuffledCourses = courses.map(c => ({
      ...c,
      sections: [...c.sections].sort(() => Math.random() - 0.5)
    }));

    let allPossibleSolutions: Schedule[] = [];
    
    const backtrack = (courseIndex: number, current: { course: Course; section: Section }[]) => {
      if (allPossibleSolutions.length >= 500) return; // Increased search limit
      
      if (courseIndex === shuffledCourses.length) {
        allPossibleSolutions.push({
          id: Math.random().toString(36).substring(2, 11),
          courses: current.map(c => ({
            courseId: c.course.id,
            courseName: c.course.name,
            sectionName: c.section.name,
            color: c.course.color,
            slots: c.section.slots
          }))
        });
        return;
      }

      const course = shuffledCourses[courseIndex];
      for (const section of course.sections) {
        // Optimization: check if this section clashes with what we already have
        const currentSlots = current.flatMap(c => c.section.slots);
        let clashes = false;
        for (const s1 of section.slots) {
          for (const s2 of currentSlots) {
            if (isClashing(s1, s2)) {
              clashes = true;
              break;
            }
          }
          if (clashes) break;
        }

        if (!clashes) {
          backtrack(courseIndex + 1, [...current, { course, section }]);
        }
      }
    };

    backtrack(0, []);

    // Return more results to satisfy "all possible" request, but capped for UI
    if (allPossibleSolutions.length <= 15) {
      setResults(allPossibleSolutions);
    } else {
      // Pick diverse ones but more of them
      const selected: Schedule[] = [];
      const pool = [...allPossibleSolutions];
      
      selected.push(pool.shift()!);

      const getSimilarity = (s1: Schedule, s2: Schedule) => {
        let overlap = 0;
        for (const c1 of s1.courses) {
          const c2 = s2.courses.find(c => c.courseId === c1.courseId);
          if (c2 && c2.sectionName === c1.sectionName) overlap++;
        }
        return overlap;
      };

      // Select up to 15 diverse solutions
      while (selected.length < 15 && pool.length > 0) {
        let minTotalSim = Infinity;
        let bestCandidateIdx = -1;

        for (let i = 0; i < pool.length; i++) {
          let totalSim = 0;
          for (const s of selected) {
            totalSim += getSimilarity(s, pool[i]);
          }
          
          if (totalSim < minTotalSim) {
            minTotalSim = totalSim;
            bestCandidateIdx = i;
          }
          if (totalSim === 0) break;
        }

        if (bestCandidateIdx !== -1) {
          selected.push(pool.splice(bestCandidateIdx, 1)[0]);
        } else {
          break;
        }
      }

      setResults(selected);
    }
    setScreen('results');
  };

  const viewScheduleDetails = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    if (user) {
      localStorage.setItem(`timetable_selected_schedule_${user.id}`, JSON.stringify(schedule));
    }
    localStorage.setItem('timetable_selected_schedule', JSON.stringify(schedule));
    localStorage.setItem('timetable_screen', 'final_view');
    setScreen('final_view');
  };

  const handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-black text-stone-200' : 'bg-[#fcfbf9] text-zinc-800'} font-sans pb-12`}>
      {/* Header */}
      <header className={`px-6 py-6 md:py-8 max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-5 font-sans no-print border-b mb-8 ${darkMode ? 'border-stone-800' : 'border-stone-100'}`}>
        <div>
          <div 
            className={`flex items-center gap-3 mb-1 ${isLoggedIn ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}`}
            onClick={() => {
              if (isLoggedIn) {
                setScreen(selectedSchedule ? 'final_view' : 'courses');
              }
            }}
          >
            <div className={`p-2.5 rounded-full shadow-sm flex items-center justify-center ${darkMode ? 'bg-stone-200 text-black' : 'bg-stone-900 text-white'}`}>
              <Calendar size={20} strokeWidth={2} />
            </div>
            <h1 className={`text-3xl font-serif italic tracking-tight ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>
              Scholarly
            </h1>
          </div>
          <p className="text-stone-400 text-xs uppercase tracking-[0.2em] font-medium pl-[52px]">Refined Academic Optimization</p>
        </div>

        {isLoggedIn && (
          <nav className={`flex flex-wrap items-center gap-1.5 p-1 rounded-full border shadow-sm transition-colors ${darkMode ? 'bg-stone-900/80 border-stone-800' : 'bg-stone-100/80 border-stone-200/60'}`}>
            <button
              onClick={() => setScreen('final_view')}
              disabled={!selectedSchedule}
              className={`px-3.5 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                screen === 'final_view'
                  ? (darkMode ? 'bg-emerald-950 text-emerald-300 shadow-sm border border-emerald-800/60' : 'bg-emerald-900 text-white shadow-sm')
                  : selectedSchedule
                    ? (darkMode ? 'text-stone-300 hover:text-white hover:bg-stone-800/50' : 'text-stone-700 hover:text-stone-950 hover:bg-white/60')
                    : 'opacity-40 cursor-not-allowed text-stone-400'
              }`}
              title={selectedSchedule ? "View Active Saved Timetable" : "Finalize a schedule to unlock"}
            >
              <Clock size={12} />
              <span>My Timetable</span>
              {selectedSchedule && (
                <span className={`w-2 h-2 rounded-full ${screen === 'final_view' ? 'bg-emerald-400' : 'bg-emerald-500 animate-pulse'}`} />
              )}
            </button>

            <button
              onClick={() => setScreen('results')}
              disabled={results.length === 0}
              className={`px-3.5 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                screen === 'results'
                  ? (darkMode ? 'bg-stone-200 text-black shadow-sm' : 'bg-stone-900 text-white shadow-sm')
                  : results.length > 0
                    ? (darkMode ? 'text-stone-300 hover:text-white hover:bg-stone-800/50' : 'text-stone-700 hover:text-stone-950 hover:bg-white/60')
                    : 'opacity-40 cursor-not-allowed text-stone-400'
              }`}
            >
              <LayoutDashboard size={12} />
              <span>Solutions {results.length > 0 ? `(${results.length})` : ''}</span>
            </button>

            <button
              onClick={() => setScreen('courses')}
              className={`px-3.5 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                screen === 'courses' || screen === 'course_summary'
                  ? (darkMode ? 'bg-stone-200 text-black shadow-sm' : 'bg-stone-900 text-white shadow-sm')
                  : (darkMode ? 'text-stone-300 hover:text-white hover:bg-stone-800/50' : 'text-stone-700 hover:text-stone-950 hover:bg-white/60')
              }`}
            >
              <BookOpen size={12} />
              <span>Courses ({courses.length})</span>
            </button>

            <button
              onClick={() => setScreen('profile')}
              className={`px-3.5 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                screen === 'profile'
                  ? (darkMode ? 'bg-stone-200 text-black shadow-sm' : 'bg-stone-900 text-white shadow-sm')
                  : (darkMode ? 'text-stone-300 hover:text-white hover:bg-stone-800/50' : 'text-stone-700 hover:text-stone-950 hover:bg-white/60')
              }`}
            >
              <User size={12} />
              <span>{user?.name || 'Profile'}</span>
            </button>
          </nav>
        )}
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full transition-all font-bold text-[10px] uppercase tracking-widest border shadow-sm ${
              darkMode 
                ? 'bg-stone-900 text-stone-200 border-stone-800 hover:bg-stone-800' 
                : 'bg-white text-stone-600 border-stone-100 hover:bg-stone-50'
            }`}
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            <span>{darkMode ? 'Light' : 'Dark'}</span>
          </button>

          {isLoggedIn ? (
            <button 
              onClick={handleLogout}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all font-bold text-[10px] uppercase tracking-widest border ${
                darkMode 
                  ? 'text-stone-400 hover:text-stone-100 border-stone-800 hover:bg-stone-900' 
                  : 'text-stone-500 hover:text-stone-900 border-stone-100 hover:bg-stone-50'
              }`}
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          ) : null}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4">
        <AnimatePresence mode="wait">
          {screen === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <LandingScreen onChoice={handleLandingChoice} hasExistingUser={users.length > 0} darkMode={darkMode} />
            </motion.div>
          )}
          {screen === 'user_selection' && (
            <motion.div
              key="user_selection"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
            >
              <UserSelectionScreen 
                users={users} 
                darkMode={darkMode}
                onSelect={handleSelectUser}
                onBack={() => setScreen('landing')}
              />
            </motion.div>
          )}
          {screen === 'login' && user && (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
            >
              <LoginScreen 
                user={user} 
                darkMode={darkMode}
                onLogin={() => {
                  setIsLoggedIn(true);
                  if (selectedSchedule) {
                    setScreen('final_view');
                  } else if (results.length > 0) {
                    setScreen('results');
                  } else {
                    setScreen('courses');
                  }
                }} 
                onDelete={() => handleDeleteUser(user.id)}
                onBack={() => setScreen('landing')} 
              />
            </motion.div>
          )}
          {screen === 'profile' && (
            <motion.div 
              key={`profile-${user?.name || 'new'}-${isLoggedIn}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ProfileScreen 
                onSubmit={handleAuth} 
                initialData={user} 
                isLoggedIn={isLoggedIn}
                darkMode={darkMode}
                onBack={() => setScreen('landing')}
                hasExistingUsers={users.length > 0}
              />
            </motion.div>
          )}
          {screen === 'courses' && (
            <motion.div 
              key="courses"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CourseInputScreen 
                courses={courses} 
                setCourses={setCourses} 
                onGenerate={generateSchedules}
                onViewSummary={() => setScreen('course_summary')}
                selectedSchedule={selectedSchedule}
                resultsCount={results.length}
                onViewSchedule={() => setScreen('final_view')}
                onViewResults={() => setScreen('results')}
                darkMode={darkMode}
              />
            </motion.div>
          )}
          {screen === 'course_summary' && (
            <motion.div 
              key="summary"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CourseSummaryScreen 
                courses={courses} 
                onBack={() => setScreen('courses')}
                darkMode={darkMode}
              />
            </motion.div>
          )}
          {screen === 'results' && (
            <motion.div 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ResultsScreen 
                results={results} 
                onBack={() => setScreen('courses')} 
                onSelect={viewScheduleDetails}
                darkMode={darkMode}
              />
            </motion.div>
          )}
          {screen === 'final_view' && selectedSchedule && (
            <motion.div 
              key="final"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
            >
              <FinalScheduleScreen 
                schedule={selectedSchedule} 
                onBack={() => setScreen(results.length > 0 ? 'results' : 'courses')} 
                onGoToCourses={() => setScreen('courses')}
                darkMode={darkMode}
              />
            </motion.div>
          )}
          {screen === 'final_view' && !selectedSchedule && (
            <motion.div 
              key="final-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-md mx-auto text-center space-y-6 pt-12"
            >
              <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto border ${darkMode ? 'bg-stone-900 border-stone-800 text-stone-400' : 'bg-white border-stone-200 text-stone-600'}`}>
                <Calendar size={32} />
              </div>
              <div>
                <h3 className={`text-2xl font-serif italic ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>No Active Schedule Selected</h3>
                <p className={`text-xs mt-2 font-serif italic ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>Select one from your generated solutions or register courses.</p>
              </div>
              <div className="flex justify-center gap-3">
                {results.length > 0 ? (
                  <button onClick={() => setScreen('results')} className={`px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider ${darkMode ? 'bg-emerald-400 text-black' : 'bg-emerald-900 text-white'}`}>View Solutions ({results.length})</button>
                ) : (
                  <button onClick={() => setScreen('courses')} className={`px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider ${darkMode ? 'bg-emerald-400 text-black' : 'bg-emerald-900 text-white'}`}>Go to Courses</button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/// --- Screens ---

function LandingScreen({ onChoice, hasExistingUser, darkMode }: { onChoice: (t: 'new' | 'returning') => void, hasExistingUser: boolean, darkMode: boolean }) {
  return (
    <div className="max-w-2xl mx-auto text-center py-20 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl mx-auto mb-10 ${darkMode ? 'bg-stone-200 text-black' : 'bg-stone-900 text-white'}`}
      >
        <Calendar size={32} strokeWidth={1.5} />
      </motion.div>
      
      <h2 className={`text-4xl md:text-5xl font-serif italic tracking-tight mb-4 leading-tight ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>
        Your Smart <span className={darkMode ? 'text-emerald-400' : 'text-emerald-800'}>Schedule</span>
      </h2>
      <p className={`text-lg mb-12 max-w-lg mx-auto leading-relaxed italic font-serif font-medium ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
        Easily find conflicts and organize your perfect class timetable for the semester.
      </p>

      <div className={`grid grid-cols-1 ${hasExistingUser ? 'md:grid-cols-2' : 'max-w-sm ml-auto mr-auto'} gap-6 mx-auto`}>
        <button
          onClick={() => onChoice('new')}
          className={`group relative flex flex-col items-center gap-4 p-10 rounded-[3rem] border transition-all ${
            darkMode 
              ? 'bg-emerald-950 border-emerald-900 text-white hover:bg-black hover:shadow-2xl hover:shadow-emerald-900/20 hover:-translate-y-1' 
              : 'bg-emerald-900 border-emerald-800 text-white hover:bg-emerald-950 hover:shadow-2xl hover:-translate-y-1'
          }`}
        >
          <div className="p-4 rounded-full bg-white/5 text-white group-hover:bg-white/10 transition-all border border-white/10">
            <Plus size={28} />
          </div>
          <div className="text-center">
            <span className="block font-bold text-lg text-white mb-1 uppercase tracking-widest text-[11px]">New Planner</span>
            <span className="text-xs text-white/50 font-medium font-serif italic">Start fresh for the term</span>
          </div>
        </button>

        {hasExistingUser && (
          <button
            onClick={() => onChoice('returning')}
            className={`group relative flex flex-col items-center gap-4 p-10 rounded-[3rem] border transition-all ${
              darkMode 
                ? 'bg-stone-900 border-stone-800 text-stone-100 hover:bg-stone-800 hover:shadow-2xl hover:shadow-white/5 hover:-translate-y-1' 
                : 'bg-white border-stone-100 text-stone-900 hover:border-stone-900 hover:shadow-2xl hover:-translate-y-1'
            }`}
          >
            <div className={`p-4 rounded-full transition-all border ${darkMode ? 'bg-stone-800 text-stone-100 border-stone-700' : 'bg-stone-50 text-stone-900 border-stone-100'}`}>
              <LogIn size={28} />
            </div>
            <div className="text-center">
              <span className={`block font-bold text-lg mb-1 uppercase tracking-widest text-[11px] ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>Open Saved</span>
              <span className={`text-xs font-medium font-serif italic ${darkMode ? 'text-stone-400' : 'text-stone-400'}`}>Load your saved classes</span>
            </div>
          </button>
        )}
      </div>

      <div className={`mt-16 flex items-center justify-center gap-8 opacity-40 grayscale ${darkMode ? 'text-stone-400' : 'text-zinc-800'}`}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} />
          <span className="text-[10px] uppercase font-bold tracking-widest">Local Security</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span className="text-[10px] uppercase font-bold tracking-widest">Conflict Detection</span>
        </div>
      </div>
    </div>
  );
}

function UserSelectionScreen({ users, darkMode, onSelect, onBack }: { users: UserProfile[], darkMode: boolean, onSelect: (u: UserProfile) => void, onBack: () => void }) {
  return (
    <div className={`max-w-2xl mx-auto rounded-[2rem] shadow-xl p-10 border transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-100'}`}>
      <div className="text-center mb-10">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border ${darkMode ? 'bg-black text-stone-200 border-stone-800' : 'bg-stone-50 text-stone-900 border-stone-100'}`}>
          <UserCheck size={28} />
        </div>
        <h2 className={`text-3xl font-serif italic mb-2 ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>Who is studying?</h2>
        <p className={`text-sm leading-relaxed font-serif italic opacity-70 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
          Multiple profiles found. Please select your identity to proceed.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {users.map((u) => {
          const avatar = AVATAR_ICONS.find(a => a.id === u.avatarIcon) || AVATAR_ICONS[0];
          const AvatarIcon = avatar.icon;
          
          return (
            <button
              key={u.id}
              onClick={() => onSelect(u)}
              className={`flex items-center gap-4 p-6 rounded-[2rem] border transition-all text-left group ${
                darkMode 
                  ? 'bg-black/50 border-stone-800 hover:bg-stone-800 hover:border-emerald-900/50' 
                  : 'bg-stone-50/50 border-stone-100 hover:bg-white hover:shadow-xl hover:border-emerald-100'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                darkMode ? 'bg-stone-900 text-stone-100' : 'bg-white text-stone-900 shadow-sm'
              }`}>
                <AvatarIcon size={24} />
              </div>
              <div className="flex-1">
                <h4 className={`font-bold font-serif italic text-lg leading-tight transition-colors ${darkMode ? 'text-stone-100 group-hover:text-emerald-400' : 'text-stone-950 group-hover:text-emerald-900'}`}>{u.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>ID: {u.id.toUpperCase()}</span>
                  <span className={`w-1 h-1 rounded-full ${darkMode ? 'bg-stone-700' : 'bg-stone-300'}`}></span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${darkMode ? 'text-emerald-500' : 'text-emerald-700'}`}>Sem {u.semester}</span>
                </div>
              </div>
              <ChevronRight size={18} className={`transition-transform group-hover:translate-x-1 ${darkMode ? 'text-stone-700' : 'text-stone-300'}`} />
            </button>
          );
        })}
      </div>

      <button
        onClick={onBack}
        className={`w-full py-4 rounded-full font-bold uppercase tracking-widest text-[10px] transition-all border flex items-center justify-center gap-2 ${
          darkMode 
            ? 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700 hover:text-stone-100' 
            : 'bg-stone-50 text-stone-600 border-stone-100 hover:bg-stone-100'
        }`}
      >
        <ArrowLeft size={14} />
        Back to Start
      </button>
    </div>
  );
}

function LoginScreen({ user, onLogin, onDelete, onBack, darkMode }: { user: UserProfile, onLogin: () => void, onDelete: () => void, onBack: () => void, darkMode: boolean }) {
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleVerify = () => {
    if (selectedIcon === user.avatarIcon) {
      setIsVerified(true);
    } else {
      setError(true);
      setSelectedIcon(null);
      setTimeout(() => setError(false), 1000);
    }
  };

  return (
    <div className={`max-w-md mx-auto rounded-[2rem] shadow-xl p-10 border transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-100'}`}>
      <div className="text-center mb-10">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border ${darkMode ? 'bg-black text-stone-200 border-stone-800' : 'bg-stone-50 text-stone-900 border-stone-100'}`}>
          <UserCheck size={28} />
        </div>
        <h2 className={`text-3xl font-serif italic mb-2 ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>Welcome back, {user.name}</h2>
        <p className={`text-sm leading-relaxed font-serif italic opacity-70 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
          {showDeleteConfirm 
            ? "Are you sure you want to delete your schedule data?"
            : isVerified 
              ? "Opening your class dashboard..." 
              : "Pick your secret icon to unlock your profile."}
        </p>
      </div>

      {showDeleteConfirm ? (
        <div className="space-y-4">
          <button
            onClick={onDelete}
            className="w-full bg-rose-900 text-white py-5 rounded-full font-bold flex items-center justify-center gap-3 hover:bg-rose-950 transition-all shadow-sm uppercase tracking-widest text-[11px]"
          >
            <Trash2 size={16} />
            <span>Confirm Deletion</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className={`w-full py-4 rounded-full font-bold uppercase tracking-widest text-[10px] transition-all border ${darkMode ? 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700 hover:text-stone-100' : 'bg-stone-50 text-stone-600 border-stone-100 hover:bg-stone-100'}`}
          >
            Cancel
          </button>
        </div>
      ) : !isVerified ? (
        <>
          <div className="grid grid-cols-4 gap-4 mb-10">
            {AVATAR_ICONS.map((item) => {
              const Icon = item.icon;
              const isSelected = selectedIcon === item.id;
              return (
                <motion.button
                  key={item.id}
                  onClick={() => setSelectedIcon(item.id)}
                  animate={error && isSelected ? { x: [-5, 5, -5, 5, 0] } : {}}
                  transition={{ duration: 0.4 }}
                  className={`aspect-square rounded-2xl flex items-center justify-center transition-all ${
                    isSelected 
                      ? `${darkMode ? 'bg-stone-200 shadow-white/5' : 'bg-stone-900 shadow-lg'} -translate-y-1` 
                      : `${darkMode ? 'bg-black/50 border-stone-800 hover:bg-stone-800' : 'bg-stone-50/50 border-stone-100/50 hover:bg-stone-100'} hover:scale-105 border`
                  }`}
                >
                  <Icon 
                    size={20} 
                    className={isSelected ? (darkMode ? 'text-black' : 'text-white') : (darkMode ? 'text-stone-600' : 'text-stone-300')} 
                  />
                </motion.button>
              );
            })}
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-rose-500 font-bold text-[10px] uppercase tracking-widest mb-6"
            >
              Identity Mismatch
            </motion.p>
          )}

          <div className="space-y-4">
            <button
              onClick={handleVerify}
              disabled={!selectedIcon}
              className={`group w-full py-5 rounded-full font-bold uppercase tracking-widest text-[11px] transition-all shadow-lg flex items-center justify-center gap-2 ${
                darkMode 
                  ? 'bg-stone-200 text-black hover:bg-stone-100 shadow-stone-200/5 disabled:opacity-30' 
                  : 'bg-emerald-900 text-white hover:bg-emerald-950 shadow-emerald-900/10 disabled:opacity-50'
              }`}
            >
              <span>Verify Scholar</span>
              <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onBack}
              className={`w-full font-bold uppercase tracking-widest text-[10px] transition-colors py-2 ${darkMode ? 'text-stone-600 hover:text-stone-200' : 'text-stone-400 hover:text-stone-900'}`}
            >
              Return Home
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className={`py-3 rounded-xl flex items-center justify-center gap-2 mb-2 border ${darkMode ? 'bg-emerald-900/10 text-emerald-400 border-emerald-900/20' : 'bg-emerald-50 text-emerald-800 border-emerald-100/50'}`}>
            <CheckCircle2 size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Identity Confirmed</span>
          </div>

          <button
            onClick={onLogin}
            className={`group w-full py-5 rounded-full font-bold flex items-center justify-center gap-3 transition-all shadow-xl uppercase tracking-widest text-[11px] ${
              darkMode 
                ? 'bg-stone-200 text-black hover:bg-stone-100 shadow-stone-200/5' 
                : 'bg-stone-900 text-white hover:bg-stone-800 shadow-black/5'
            }`}
          >
            <LogIn size={18} />
            <span>Enter Archives</span>
            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className={`group w-full border py-4 rounded-full font-bold flex items-center justify-center gap-3 transition-all uppercase tracking-widest text-[10px] ${
              darkMode 
                ? 'bg-transparent text-rose-400 border-rose-900/30 hover:bg-rose-900/10 hover:text-rose-300' 
                : 'bg-white text-rose-900 border-stone-100 hover:bg-stone-50'
            }`}
          >
            <Trash2 size={16} />
            <span>Discard Profile</span>
          </button>
        </div>
      )}
    </div>
  );
}

function CourseSummaryScreen({ courses, onBack, darkMode }: { courses: Course[], onBack: () => void, darkMode: boolean }) {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${darkMode ? 'text-stone-500 hover:text-emerald-400' : 'text-stone-700 hover:text-emerald-900'}`}>
          <ArrowLeft size={14} /> Back to Registry
        </button>
        <div className={`px-4 py-2 rounded-full border shadow-sm flex items-center gap-3 transition-colors ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'}`}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${darkMode ? 'bg-emerald-400' : 'bg-emerald-600'}`}></div>
          <span className={`text-[9px] font-bold uppercase tracking-widest ${darkMode ? 'text-stone-400' : 'text-stone-700'}`}>{courses.length} Courses Cataloged</span>
        </div>
      </div>

      <div className={`rounded-[3rem] border shadow-xl overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800 shadow-emerald-900/5' : 'bg-white border-stone-200 shadow-stone-200/20'}`}>
        <div className={`${darkMode ? 'bg-stone-950' : 'bg-stone-900'} p-10 text-white relative overflow-hidden`}>
          <div className="relative z-10">
            <h2 className="text-3xl font-serif italic mb-2 tracking-tight">Curriculum Overview</h2>
            <p className={`text-sm max-w-md font-serif italic font-medium ${darkMode ? 'text-stone-400' : 'text-stone-300'}`}>Comprehensive analysis of all academic sections and scheduled timeframes for optimization.</p>
          </div>
          <div className={`absolute top-0 right-0 p-12 opacity-5 rotate-12 scale-150 ${darkMode ? 'text-emerald-400' : 'text-white'}`}>
            <BookOpen size={120} />
          </div>
        </div>

        <div className="p-10">
          {courses.length === 0 ? (
            <div className="py-20 text-center">
              <BookOpen size={48} className={`mx-auto mb-4 opacity-10 ${darkMode ? 'text-stone-400' : 'text-stone-900'}`} />
              <p className={`font-serif italic opacity-60 ${darkMode ? 'text-stone-400' : 'text-stone-400'}`}>No academic records identified.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {courses.map(course => (
                <div key={course.id} className={`border rounded-[3rem] p-8 transition-all ${darkMode ? 'bg-black/40 border-stone-800 hover:border-emerald-900/50' : 'bg-stone-50/30 border-stone-100 hover:border-stone-200'}`}>
                  <div className="flex items-center gap-4 mb-8">
                    <div className={`w-1 h-12 rounded-full ${course.color}`}></div>
                    <div>
                      <h4 className={`font-serif italic font-bold text-xl tracking-tight ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>{course.name}</h4>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-stone-600' : 'text-stone-600'}`}>{course.sections.length} defined sections</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {course.sections.map(section => (
                      <div key={section.id} className={`p-5 rounded-[2rem] border shadow-sm transition-all hover:shadow-md ${darkMode ? 'bg-stone-900 border-stone-800 hover:border-stone-700' : 'bg-white border-stone-100 shadow-stone-200/5'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-widest border ${darkMode ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50' : 'text-emerald-800 bg-emerald-50 border-emerald-100/50'}`}>{section.name}</span>
                        </div>
                        <div className="space-y-2">
                          {section.slots.map((slot, idx) => (
                            <div key={idx} className="flex items-center gap-3 text-[11px] font-bold transition-colors">
                              <div className={`w-1 h-1 rounded-full ${darkMode ? 'bg-stone-700' : 'bg-stone-400'}`}></div>
                              <span className={`min-w-[90px] font-serif italic ${darkMode ? 'text-stone-300' : 'text-stone-950'}`}>{slot.day}</span>
                              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors ${darkMode ? 'bg-black border-stone-800 text-stone-400' : 'bg-stone-100 border-stone-200 text-stone-700'}`}>{slot.startTime}</span>
                              <span className={`font-serif italic text-xs ${darkMode ? 'text-stone-700' : 'text-stone-400 opacity-50'}`}>—</span>
                              <span className={`font-mono text-[10px] px-1.5 py-1 rounded border transition-colors ${darkMode ? 'bg-black border-stone-800 text-stone-400' : 'bg-stone-100 border-stone-200 text-stone-700'}`}>{slot.endTime}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`p-10 border-t flex justify-center transition-colors ${darkMode ? 'bg-black border-stone-800' : 'bg-stone-50/50 border-stone-100'}`}>
           <button 
            onClick={onBack}
            className={`font-bold py-4 px-12 rounded-full text-[10px] transition-all uppercase tracking-[0.2em] shadow-xl ${
              darkMode 
                ? 'bg-stone-200 text-black hover:bg-stone-100 shadow-stone-200/5' 
                : 'bg-stone-900 text-white hover:bg-black shadow-black/5'
            }`}
          >
            Modify Curriculum
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileScreen({ onSubmit, initialData, isLoggedIn, darkMode, onBack, hasExistingUsers }: { onSubmit: (u: UserProfile) => void, initialData: UserProfile | null, isLoggedIn: boolean, darkMode: boolean, onBack?: () => void, hasExistingUsers?: boolean }) {
  const [name, setName] = useState(initialData?.name || '');
  const [semester, setSemester] = useState(initialData?.semester || 1);
  const [avatarIcon, setAvatarIcon] = useState(initialData?.avatarIcon || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData && isLoggedIn) {
      setName(initialData.name);
      setSemester(initialData.semester);
      setAvatarIcon(initialData.avatarIcon);
    }
  }, [initialData, isLoggedIn]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!avatarIcon) {
      setError("Please choose a security icon.");
      return;
    }
    
    onSubmit({ 
      id: initialData?.id || '', 
      name, 
      semester, 
      avatarIcon 
    });
  };

  return (
    <div className={`max-w-md mx-auto rounded-[2rem] shadow-xl p-10 border transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-100'}`}>
      <div className="mb-10 text-center">
        <div className={`inline-block p-4 rounded-3xl mb-4 border transition-colors ${darkMode ? 'bg-emerald-900/20 border-emerald-900/30' : 'bg-emerald-50 border-emerald-100/50'}`}>
          <Sparkles className={darkMode ? 'text-emerald-400' : 'text-emerald-900'} size={32} />
        </div>
        <h2 className={`text-2xl font-serif italic mb-2 tracking-tight ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>
          {isLoggedIn ? 'Edit Profile' : 'Student Identity'}
        </h2>
        <p className={`text-sm font-serif italic opacity-70 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
          {isLoggedIn ? 'Update your current information.' : "Create your student profile and pick an icon."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-rose-50 border border-rose-100 text-rose-600 px-4 py-3 rounded-xl text-[10px] font-bold flex items-center gap-2 uppercase tracking-widest"
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}
        
        <div className="space-y-6">
          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-[0.2em] mb-2 px-1 ${darkMode ? 'text-stone-500' : 'text-stone-600'}`}>Identity Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Chen"
              className={`w-full px-5 py-4 rounded-2xl border outline-none transition-all font-bold ${
                darkMode 
                  ? 'bg-black border-stone-800 text-stone-100 focus:border-stone-600 focus:ring-4 focus:ring-stone-200/5' 
                  : 'bg-stone-100 border-stone-200 text-zinc-950 focus:ring-4 focus:ring-emerald-50 focus:border-emerald-900'
              }`}
              required
            />
          </div>

          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-[0.2em] mb-3 px-1 ${darkMode ? 'text-stone-500' : 'text-stone-600'}`}>Choose Security Icon</label>
            <div className="grid grid-cols-4 gap-3">
              {AVATAR_ICONS.map((item) => {
                const Icon = item.icon;
                const isSelected = avatarIcon === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAvatarIcon(item.id)}
                    className={`aspect-square rounded-2xl flex items-center justify-center transition-all ${
                      isSelected 
                        ? `${darkMode ? 'bg-stone-200 shadow-stone-200/5' : 'bg-stone-900 shadow-xl'} scale-105` 
                        : `${darkMode ? 'bg-black border-stone-800' : 'bg-stone-100 border-stone-200 hover:bg-stone-200'}`
                    }`}
                    title={item.label}
                  >
                    <Icon 
                      size={20} 
                      className={isSelected ? (darkMode ? 'text-black' : 'text-white') : (darkMode ? 'text-stone-600' : 'text-stone-600')} 
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-[0.2em] mb-3 px-1 ${darkMode ? 'text-stone-500' : 'text-stone-600'}`}>Academic Semester</label>
            <div className="grid grid-cols-4 gap-2">
              {SEMESTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSemester(s)}
                  className={`py-3 rounded-xl font-bold text-[10px] transition-all uppercase tracking-widest ${
                    semester === s 
                      ? `${darkMode ? 'bg-stone-200 text-black shadow-stone-200/5' : 'bg-emerald-900 text-white shadow-emerald-900/10'}` 
                      : `${darkMode ? 'bg-black border-stone-800 text-stone-500 hover:bg-stone-800 hover:text-stone-300' : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'}`
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button 
          type="submit"
          className={`group w-full py-5 rounded-full font-bold flex items-center justify-center gap-3 transition-all shadow-xl uppercase tracking-widest text-[11px] mt-4 hover:-translate-y-0.5 active:translate-y-0 ${
            darkMode 
              ? 'bg-stone-200 text-black hover:bg-stone-100 shadow-stone-200/5' 
              : 'bg-stone-900 text-white hover:bg-black shadow-black/5'
          }`}
        >
          {isLoggedIn ? 'Update Profile' : 'Access Optimizer'}
          <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </button>

        {!isLoggedIn && hasExistingUsers && onBack && (
          <button 
            type="button"
            onClick={onBack}
            className={`w-full py-4 rounded-full font-bold uppercase tracking-widest text-[10px] transition-all border flex items-center justify-center gap-2 mt-4 ${
              darkMode 
                ? 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700 hover:text-stone-100' 
                : 'bg-stone-50 text-stone-500 border-stone-100 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <LogIn size={14} />
            I'm a returning student
          </button>
        )}
      </form>
    </div>
  );
}

function CourseInputScreen({ 
  courses, 
  setCourses, 
  onGenerate, 
  onViewSummary, 
  darkMode,
  selectedSchedule,
  resultsCount = 0,
  onViewSchedule,
  onViewResults
}: { 
  courses: Course[], 
  setCourses: any, 
  onGenerate: () => void, 
  onViewSummary: () => void, 
  darkMode: boolean,
  selectedSchedule?: Schedule | null,
  resultsCount?: number,
  onViewSchedule?: () => void,
  onViewResults?: () => void
}) {
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [isExtractingAI, setIsExtractingAI] = useState(false);
  const [extractingProgress, setExtractingProgress] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseColor, setNewCourseColor] = useState(COURSE_COLORS[0]);
  const [newCourseSections, setNewCourseSections] = useState<Section[]>([]);
  
  // Adding section state
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionSlots, setNewSectionSlots] = useState<TimeSlot[]>([
    { day: Day.Monday, startTime: '09:00', endTime: '10:00' }
  ]);

  const addCourse = () => {
    if (!newCourseName.trim() || newCourseSections.length === 0) return;
    
    if (editingCourseId) {
      setCourses(courses.map(c => c.id === editingCourseId ? {
        ...c,
        name: newCourseName,
        color: newCourseColor,
        sections: [...newCourseSections]
      } : c));
      setEditingCourseId(null);
    } else {
      const course: Course = {
        id: Math.random().toString(36).substring(2, 11),
        name: newCourseName,
        color: newCourseColor,
        sections: newCourseSections
      };
      setCourses([...courses, course]);
    }

    setNewCourseName('');
    setNewCourseColor(COURSE_COLORS[courses.length % COURSE_COLORS.length]);
    setNewCourseSections([]);
    setIsAddingCourse(false);
  };

  const addSection = () => {
    const trimmedName = newSectionName.trim();
    if (!trimmedName) return;
    
    if (editingSectionId) {
      setNewCourseSections(prev => prev.map(s => s.id === editingSectionId ? {
        ...s,
        name: trimmedName,
        slots: [...newSectionSlots]
      } : s));
      setEditingSectionId(null);
    } else {
      const section: Section = {
        id: Math.random().toString(36).substring(2, 11),
        name: trimmedName,
        slots: [...newSectionSlots]
      };
      setNewCourseSections(prev => [...prev, section]);
    }
    
    setNewSectionName('');
    setNewSectionSlots([{ day: Day.Monday, startTime: '09:00', endTime: '10:00' }]);
    setIsAddingSection(false);
  };

  const startEditSection = (section: Section) => {
    setEditingSectionId(section.id);
    setNewSectionName(section.name);
    setNewSectionSlots([...section.slots]);
    setIsAddingSection(true);
  };

  const removeSection = (id: string) => {
    setNewCourseSections(newCourseSections.filter(s => s.id !== id));
    if (editingSectionId === id) {
      setEditingSectionId(null);
      setNewSectionName('');
      setNewSectionSlots([{ day: Day.Monday, startTime: '09:00', endTime: '10:00' }]);
      setIsAddingSection(false);
    }
  };

  const startEditCourse = (course: Course) => {
    setEditingCourseId(course.id);
    setNewCourseName(course.name);
    setNewCourseColor(course.color);
    setNewCourseSections([...course.sections]);
    setIsAddingCourse(true);
  };

  const removeCourse = (id: string) => {
    setCourses(courses.filter(c => c.id !== id));
    if (editingCourseId === id) {
      setEditingCourseId(null);
      setNewCourseName('');
      setNewCourseSections([]);
      setIsAddingCourse(false);
    }
  };

  const addSlotToSection = () => {
    setNewSectionSlots([...newSectionSlots, { day: Day.Monday, startTime: '09:00', endTime: '10:00' }]);
  };

  const updateSectionSlot = (index: number, updates: Partial<TimeSlot>) => {
    const updated = [...newSectionSlots];
    updated[index] = { ...updated[index], ...updates };
    setNewSectionSlots(updated);
  };

  const removeSlotFromSection = (index: number) => {
    setNewSectionSlots(newSectionSlots.filter((_, i) => i !== index));
  };

  return (
    <div className="gap-6 grid grid-cols-1 md:grid-cols-12">
    <div className="max-md:p-0 md:col-span-4 h-fit sticky top-24">
        <div className={`rounded-[2.5rem] p-8 shadow-xl mb-8 transition-all duration-300 ${darkMode ? 'bg-stone-900 text-white border border-stone-800' : 'bg-stone-900 p-8 text-white shadow-xl shadow-stone-200/20'}`}>
          <p className={`text-[10px] uppercase tracking-[0.2em] font-bold mb-2 px-1 ${darkMode ? 'text-stone-500' : 'text-stone-300'}`}>Smart Planner</p>
          <h2 className="text-3xl font-serif italic mb-4 tracking-tight">My Courses</h2>
          <p className={`text-sm opacity-90 leading-relaxed mb-8 font-serif italic font-medium ${darkMode ? 'text-stone-400' : 'text-stone-200'}`}>
            Add your classes and available times. We'll automatically build the best schedule for your semester.
          </p>
          
          <div className="space-y-4">
            {!isAddingCourse && !isExtractingAI && (
              <>
                <button 
                  onClick={() => setIsExtractingAI(true)}
                  className={`w-full py-4 rounded-full font-bold flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-[10px] shadow-lg border ${
                    darkMode 
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-900/50 hover:bg-black shadow-emerald-950/20' 
                      : 'bg-emerald-900 text-white border-emerald-800 hover:bg-emerald-950 shadow-emerald-900/10'
                  }`}
                  id="ai-extract-btn"
                >
                  <Sparkles size={16} />
                  Import Schedule
                </button>
                <div className="flex items-center gap-4 py-2">
                  <div className={`h-px flex-grow ${darkMode ? 'bg-stone-800' : 'bg-stone-800'}`}></div>
                  <span className="text-[9px] font-bold text-stone-600 uppercase tracking-widest">or</span>
                  <div className={`h-px flex-grow ${darkMode ? 'bg-stone-800' : 'bg-stone-800'}`}></div>
                </div>
                <button 
                  onClick={() => setIsAddingCourse(true)}
                  className={`w-full py-4 rounded-full font-bold flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-[10px] border ${
                    darkMode 
                      ? 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700 hover:text-stone-300' 
                      : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'
                  }`}
                  id="add-course-btn"
                >
                  <Plus size={16} />
                  Add Class Manually
                </button>
              </>
            )}

            {(isAddingCourse || isExtractingAI) && (
              <div className={`rounded-[2rem] p-6 border text-center italic font-serif transition-colors ${darkMode ? 'bg-black/50 border-stone-800' : 'bg-stone-800/50 border-stone-700/50'}`}>
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                  {isExtractingAI ? 'Reading your files...' : 'Ready to add class'}
                </p>
              </div>
            )}
          </div>
        </div>

        {courses.length > 0 && !isAddingCourse && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-[2.5rem] p-8 border shadow-sm transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-100'}`}
          >
            <h3 className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-6 px-1 ${darkMode ? 'text-stone-500' : 'text-stone-600'}`}>Planner Stats</h3>
            <div className="mb-8">
              <p className={`font-serif italic text-2xl mb-1 tracking-tight ${darkMode ? 'text-emerald-400' : 'text-emerald-900'}`}>Ready to generate</p>
              <p className={`text-[11px] font-serif italic font-medium ${darkMode ? 'text-stone-400' : 'text-stone-800'}`}>We found {courses.length} classes to organize into your schedule.</p>
            </div>
            <div className="space-y-3">
              {selectedSchedule && onViewSchedule && (
                <button 
                  onClick={onViewSchedule}
                  className={`w-full font-bold py-4 rounded-full text-[10px] transition-all uppercase tracking-[0.2em] shadow-md flex items-center justify-center gap-2 border ${
                    darkMode 
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900' 
                      : 'bg-emerald-50 text-emerald-950 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <Clock size={14} className="text-emerald-500" />
                  View Active Schedule
                </button>
              )}
              {resultsCount > 0 && onViewResults && (
                <button 
                  onClick={onViewResults}
                  className={`w-full font-bold py-3.5 rounded-full text-[9px] transition-all uppercase tracking-[0.2em] border flex items-center justify-center gap-2 ${
                    darkMode 
                      ? 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700' 
                      : 'bg-stone-100 text-stone-800 border-stone-200 hover:bg-stone-200'
                  }`}
                >
                  <LayoutDashboard size={13} />
                  Solutions ({resultsCount})
                </button>
              )}
              <button 
                onClick={onGenerate}
                className={`w-full font-bold py-5 rounded-full text-[11px] transition-all uppercase tracking-[0.2em] shadow-xl ${
                  darkMode 
                    ? 'bg-emerald-950 text-emerald-400 hover:bg-black shadow-emerald-950/20' 
                    : 'bg-emerald-900 text-white hover:bg-emerald-950 shadow-emerald-900/10'
                }`}
                id="generate-timetable-btn"
              >
                Create My Schedule
              </button>
              <button 
                onClick={onViewSummary}
                className={`w-full font-bold py-4 rounded-full text-[9px] transition-all uppercase tracking-[0.3em] border flex items-center justify-center gap-2 ${
                  darkMode 
                    ? 'bg-black text-stone-500 border-stone-800 hover:bg-stone-900 hover:text-stone-300' 
                    : 'bg-stone-50 text-stone-600 border-stone-100 hover:bg-stone-100'
                }`}
              >
                <Eye size={14} />
                View Summary
              </button>
            </div>
          </motion.div>
        )}
      </div>

      <div className="md:col-span-8 flex flex-col gap-6">
        {selectedSchedule && onViewSchedule && (
          <div className={`p-6 rounded-[2rem] border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
            darkMode ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200' : 'bg-emerald-50/70 border-emerald-100 text-emerald-950'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${darkMode ? 'bg-emerald-400 text-black' : 'bg-emerald-900 text-white'}`}>
                <Calendar size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-emerald-400' : 'text-emerald-800'}`}>Active Timetable Saved</p>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <p className={`text-base font-serif italic mt-0.5 ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>
                  {selectedSchedule.courses.length} courses enrolled • Zero clashes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onViewSchedule}
                className={`px-5 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm ${
                  darkMode ? 'bg-emerald-400 text-black hover:bg-emerald-300' : 'bg-emerald-900 text-white hover:bg-emerald-950'
                }`}
              >
                <span>View Timetable</span>
                <ChevronRight size={14} />
              </button>
              {resultsCount > 0 && onViewResults && (
                <button
                  onClick={onViewResults}
                  className={`px-4 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                    darkMode ? 'border-emerald-800 text-emerald-300 hover:bg-emerald-950/40' : 'border-emerald-200 text-emerald-900 hover:bg-emerald-100/50'
                  }`}
                >
                  All Solutions ({resultsCount})
                </button>
              )}
            </div>
          </div>
        )}
        <AnimatePresence>
          {isExtractingAI && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <AIExtractionPanel 
                darkMode={darkMode}
                onCancel={() => setIsExtractingAI(false)}
                onDataExtracted={(extractedCourses) => {
                  // Assign colors and unique IDs to new courses and their sections to prevent key collisions
                  const coloredCourses = extractedCourses.map((c, i) => ({
                    ...c,
                    id: `ai-course-${Date.now()}-${i}`,
                    color: COURSE_COLORS[(courses.length + i) % COURSE_COLORS.length],
                    sections: c.sections.map((s, si) => ({
                      ...s,
                      id: `ai-sec-${Date.now()}-${i}-${si}`
                    }))
                  }));
                  setCourses([...courses, ...coloredCourses]);
                  setIsExtractingAI(false);
                }}
              />
            </motion.div>
          )}
          {isAddingCourse && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`rounded-[2rem] p-8 shadow-xl border transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-slate-100'}`}
            >
          <h3 className={`text-xl font-serif italic mb-6 flex items-center gap-3 border-b transition-colors pb-4 ${darkMode ? 'text-stone-100 border-stone-800' : 'text-stone-900 border-stone-50'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md ${darkMode ? 'bg-stone-200 text-black' : 'bg-stone-900 text-white'}`}>
                  <BookOpen size={20} />
                </div>
                {editingCourseId ? 'Edit Course' : 'Add New Course'}
              </h3>
              <div className="space-y-6">
                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-[0.2em] mb-2 px-1 ${darkMode ? 'text-stone-400' : 'text-stone-900'}`}>Course Name</label>
                  <input 
                    type="text" 
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    className={`w-full px-5 py-4 border rounded-2xl outline-none transition-all font-bold ${
                      darkMode 
                        ? 'bg-black border-stone-800 text-stone-100 focus:border-stone-600 focus:ring-4 focus:ring-stone-200/5' 
                        : 'bg-stone-100 border-stone-200 focus:ring-4 focus:ring-stone-50 focus:border-stone-900'
                    }`}
                    placeholder="e.g. Psychology 101"
                    id="course-name-input"
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-[0.2em] mb-3 px-1 ${darkMode ? 'text-stone-400' : 'text-stone-900'}`}>Theme Accent</label>
                  <div className="flex flex-wrap gap-3">
                    {COURSE_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewCourseColor(color)}
                        className={`w-10 h-10 rounded-full transition-all border-2 ${color} ${
                          newCourseColor === color 
                            ? (darkMode ? 'border-white scale-110 shadow-lg' : 'border-stone-900 scale-110 shadow-md') 
                            : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Sections List */}
                <div className={`border rounded-[2.5rem] p-6 transition-colors duration-300 ${darkMode ? 'bg-black/40 border-stone-800' : 'bg-stone-100/30 border-stone-200'}`}>
                  <div className="flex items-center justify-between mb-6 px-1">
                    <label className={`text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-stone-400' : 'text-stone-900'}`}>Class Sections</label>
                    {!isAddingSection && (
                      <button 
                        onClick={() => setIsAddingSection(true)} 
                        className={`text-[10px] font-bold flex items-center gap-1.5 px-4 py-2 rounded-full transition-all border uppercase tracking-widest ${
                          darkMode 
                            ? 'text-emerald-400 bg-emerald-900/20 border-emerald-900/50 hover:bg-emerald-900/40' 
                            : 'text-emerald-900 hover:text-emerald-950 bg-emerald-50 border-emerald-100/50'
                        }`}
                      >
                        <Plus size={14} /> Add Section
                      </button>
                    )}
                  </div>

                  <AnimatePresence>
                    {isAddingSection && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`p-6 rounded-[2rem] border mb-6 shadow-sm transition-colors ${darkMode ? 'bg-stone-900 border-stone-800 shadow-emerald-400/5' : 'bg-white border-stone-200'}`}
                      >
                        <div className="space-y-5">
                          <h4 className={`text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-stone-400' : 'text-stone-900'}`}>
                            {editingSectionId ? 'Update Section' : 'Initialize Section'}
                          </h4>
                          <div>
                            <input 
                              placeholder="Section Label (e.g. Lab 04)"
                              className={`w-full text-lg font-serif italic border-b pb-2 outline-none transition-colors bg-transparent ${
                                darkMode ? 'text-stone-100 border-stone-800 focus:border-stone-500' : 'text-stone-900 border-stone-100 focus:border-stone-900'
                              }`}
                              value={newSectionName}
                              onChange={(e) => setNewSectionName(e.target.value)}
                              id="section-name-input"
                              autoFocus
                            />
                          </div>
                          <div className="space-y-2">
                            {newSectionSlots.map((slot, idx) => (
                              <div key={idx} className={`flex flex-wrap items-center gap-3 p-3 rounded-2xl border transition-colors ${darkMode ? 'bg-black border-stone-800' : 'bg-stone-50/50 border-stone-100/50'}`}>
                                <select 
                                  value={slot.day}
                                  onChange={(e) => updateSectionSlot(idx, { day: e.target.value as Day })}
                                  className={`text-[10px] font-bold bg-transparent outline-none cursor-pointer uppercase tracking-widest ${darkMode ? 'text-stone-200' : 'text-stone-900'}`}
                                  id={`slot-day-${idx}`}
                                >
                                  {DAYS.map(d => <option key={d} value={d} className={darkMode ? 'bg-stone-900' : ''}>{d}</option>)}
                                </select>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="time" value={slot.startTime} onChange={(e) => updateSectionSlot(idx, { startTime: e.target.value })}
                                    className={`text-[10px] font-mono bg-transparent border-b font-bold transition-colors ${darkMode ? 'border-stone-700 text-stone-200 focus:border-stone-400' : 'border-stone-300 focus:border-stone-900'}`}
                                    id={`slot-start-${idx}`}
                                  />
                                  <span className={`font-serif italic text-xs font-bold ${darkMode ? 'text-stone-600' : 'text-stone-600'}`}>to</span>
                                  <input 
                                    type="time" value={slot.endTime} onChange={(e) => updateSectionSlot(idx, { endTime: e.target.value })}
                                    className={`text-[10px] font-mono bg-transparent border-b font-bold transition-colors ${darkMode ? 'border-stone-700 text-stone-200 focus:border-stone-400' : 'border-stone-300 focus:border-stone-900'}`}
                                    id={`slot-end-${idx}`}
                                  />
                                </div>
                                {newSectionSlots.length > 1 && (
                                  <button onClick={() => removeSlotFromSection(idx)} className={`ml-auto transition-colors p-1.5 rounded-lg border ${darkMode ? 'text-rose-900 hover:text-rose-400 bg-rose-950/20 border-rose-900/30' : 'text-rose-300 hover:text-rose-500 bg-rose-50 border-rose-100'}`}>
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button onClick={addSlotToSection} className={`text-[10px] font-bold transition-colors uppercase tracking-widest ml-1 ${darkMode ? 'text-emerald-500 hover:text-emerald-400' : 'text-emerald-800 hover:text-emerald-950'}`}>+ Associate block</button>
                          </div>
                            <div className="flex gap-3 text-[10px] pt-2">
                            <button 
                              type="button"
                              onClick={() => {
                                setIsAddingSection(false);
                                setEditingSectionId(null);
                                setNewSectionName('');
                                setNewSectionSlots([{ day: Day.Monday, startTime: '09:00', endTime: '10:00' }]);
                              }} 
                              className={`flex-1 py-3 font-bold rounded-full transition-all uppercase tracking-widest border border-transparent ${
                                darkMode ? 'text-stone-500 hover:bg-stone-800 hover:border-stone-700' : 'text-stone-400 hover:bg-stone-50 hover:border-stone-100'
                              }`}
                              id="cancel-section-btn"
                            >
                              Dismiss
                            </button>
                            <button 
                              type="button"
                              onClick={addSection} 
                              disabled={!newSectionName.trim()}
                              className={`flex-1 py-3 font-bold rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md uppercase tracking-widest ${
                                darkMode ? 'bg-stone-200 text-black hover:bg-stone-50' : 'bg-stone-900 text-white hover:bg-black'
                              }`}
                              id="save-section-btn"
                            >
                              {editingSectionId ? 'Save Edits' : 'Confirm'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-3">
                    {newCourseSections.map(section => (
                      <div key={section.id} className={`p-4 rounded-2xl flex items-center justify-between border shadow-sm group/sec transition-all ${darkMode ? 'bg-stone-900 border-stone-800 hover:border-stone-700' : 'bg-white border-stone-100 hover:border-stone-200'}`}>
                        <div>
                          <p className={`text-sm font-bold font-serif italic ${darkMode ? 'text-stone-200' : 'text-stone-800'}`}>{section.name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {section.slots.map((s, i) => (
                              <span key={i} className={`text-[9px] px-2 py-1 rounded-md font-bold border uppercase tracking-tighter transition-colors ${darkMode ? 'bg-black text-stone-500 border-stone-800' : 'bg-stone-50 text-stone-600 border-stone-100'}`}>
                                {s.day.substring(0,3)} • {s.startTime}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                          <button 
                            onClick={() => startEditSection(section)} 
                            className={`p-2 rounded-lg transition-colors border border-transparent ${darkMode ? 'text-stone-600 hover:text-emerald-400 bg-black hover:border-stone-800' : 'text-stone-300 hover:text-emerald-800 bg-stone-50 hover:border-stone-100'}`}
                          >
                            <Pencil size={12} />
                          </button>
                          <button 
                            onClick={() => removeSection(section.id)} 
                            className={`p-2 rounded-lg transition-colors border border-transparent ${darkMode ? 'text-stone-600 hover:text-rose-400 bg-rose-950/20 hover:border-rose-900/30' : 'text-stone-300 hover:text-rose-500 bg-rose-50 hover:border-rose-100'}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {newCourseSections.length === 0 && !isAddingSection && (
                      <p className={`text-center text-[10px] py-6 italic font-serif opacity-60 ${darkMode ? 'text-stone-600' : 'text-stone-300'}`}>Every curriculum requires structured sections.</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 pt-4 px-1">
                  <button 
                    onClick={() => {
                      setIsAddingCourse(false);
                      setEditingCourseId(null);
                      setNewCourseName('');
                      setNewCourseSections([]);
                    }}
                    className={`flex-1 py-4 rounded-full font-bold transition-all text-[10px] uppercase tracking-widest border ${
                      darkMode ? 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700 hover:text-stone-300' : 'bg-stone-50 text-stone-400 hover:bg-stone-100 border-stone-100'
                    }`}
                  >
                    Go Back
                  </button>
                  <button 
                    onClick={addCourse}
                    className={`flex-1 py-4 rounded-full font-bold transition-all text-[10px] uppercase tracking-widest shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${
                      darkMode ? 'bg-stone-200 text-black hover:bg-white' : 'bg-stone-900 text-white hover:bg-black shadow-black/5'
                    }`}
                    disabled={!newCourseName.trim() || newCourseSections.length === 0}
                    id="save-course-btn"
                  >
                    {editingCourseId ? 'Save Changes' : 'Add Course'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`rounded-[2rem] border p-8 shadow-sm transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'}`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className={`font-serif italic text-xl ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>Academic Registry</h3>
            <span className={`text-[9px] px-3 py-1.5 rounded-full font-bold uppercase tracking-widest border transition-colors ${
              darkMode ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/40' : 'bg-emerald-50 text-emerald-800 border-emerald-100/50'
            }`}>
              {courses.length} Registered
            </span>
          </div>

          <div className="space-y-4">
            {courses.map(course => (
              <div key={course.id} className={`border rounded-2xl p-5 group transition-all ${darkMode ? 'bg-black/40 border-stone-800 hover:border-stone-700' : 'bg-stone-50/30 border-stone-100 hover:border-stone-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-1 h-12 rounded-full ${course.color}`}></div>
                    <div>
                      <h4 className={`font-bold font-serif italic text-lg leading-tight ${darkMode ? 'text-stone-100' : 'text-stone-950'}`}>{course.name}</h4>
                          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-stone-500' : 'text-stone-900'}`}>{course.sections.length} time options</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => startEditCourse(course)}
                      className={`p-2.5 rounded-full transition-all border border-transparent ${darkMode ? 'text-stone-600 hover:text-emerald-400 hover:bg-black hover:border-stone-800' : 'text-stone-300 hover:text-emerald-800 hover:bg-stone-100 hover:border-stone-100'}`}
                      title="Edit Course"
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      onClick={() => removeCourse(course.id)}
                      className={`p-2.5 rounded-full transition-all border border-transparent ${darkMode ? 'text-stone-600 hover:text-rose-400 hover:bg-rose-950/20 hover:border-rose-900/30' : 'text-stone-300 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100'}`}
                      title="Delete Course"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {courses.length === 0 && (
              <div className="text-center py-16">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border transition-colors ${darkMode ? 'bg-black border-stone-800 text-stone-700' : 'bg-stone-100 border-stone-200 text-stone-400'}`}>
                  <BookOpen size={28} />
                </div>
                <h3 className={`font-serif italic font-bold ${darkMode ? 'text-stone-400' : 'text-stone-800'}`}>No courses defined</h3>
                <p className={`text-[11px] px-12 italic font-serif font-medium ${darkMode ? 'text-stone-600' : 'text-stone-600'}`}>Start by registering your semester courses to begin the optimization process.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultsScreen({ results, onBack, onSelect, darkMode }: { results: Schedule[], onBack: () => void, onSelect: (s: Schedule) => void, darkMode: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM

  if (results.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="max-w-md mx-auto text-center space-y-6 pt-12"
      >
        <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner border ${darkMode ? 'bg-rose-950/20 text-rose-400 border-rose-900/30' : 'bg-rose-50 text-rose-500 border-rose-100'}`}>
          <AlertCircle size={40} />
        </div>
        <div>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-stone-100' : 'text-slate-800'}`}>No Valid Schedules</h2>
          <p className={`mt-2 px-8 ${darkMode ? 'text-stone-400' : 'text-slate-500'}`}>Oops! It looks like your chosen course times always clash. Try adding more options or changing some slots.</p>
        </div>
        <button 
          onClick={onBack} 
          className={`px-10 py-4 rounded-2xl font-bold inline-flex items-center gap-2 uppercase tracking-widest text-xs shadow-xl ${
            darkMode 
              ? 'bg-stone-200 text-black shadow-stone-200/5' 
              : 'bg-slate-900 text-white shadow-slate-200'
          }`}
        >
          Adjust Courses
        </button>
      </motion.div>
    );
  }

  const currentSchedule = results[activeIndex];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Sidebar Stats & Info */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <div className={`rounded-3xl p-6 shadow-xl transition-colors duration-300 ${darkMode ? 'bg-stone-900 text-white shadow-emerald-400/5 border border-stone-800' : 'bg-slate-900 text-white shadow-slate-200'}`}>
          <p className={`text-xs uppercase tracking-widest font-bold mb-1 ${darkMode ? 'text-stone-500' : 'text-slate-400'}`}>Optimization Results</p>
          <h2 className="text-3xl font-bold mb-4">{results.length} <span className="text-lg font-normal opacity-70">Solutions</span></h2>
          <div className="space-y-3">
            <div className={`flex justify-between text-xs items-center border-t pt-3 ${darkMode ? 'border-stone-800' : 'border-slate-800'}`}>
              <span className="opacity-80 uppercase tracking-wider font-bold">Conflict Analysis</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-500/10 text-emerald-400'}`}>Zero Clashes</span>
            </div>
            <div className={`flex justify-between text-xs items-center border-t pt-3 ${darkMode ? 'border-stone-800' : 'border-slate-800'}`}>
              <span className="opacity-80 uppercase tracking-wider font-bold">Course Load</span>
              <span className="font-mono">{currentSchedule.courses.length} Units</span>
            </div>
          </div>
        </div>

        <div className={`rounded-3xl p-6 border shadow-sm flex-grow transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200 shadow-stone-200/5'}`}>
          <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${darkMode ? 'text-stone-500' : 'text-stone-600'}`}>Timetable Content</h3>
          <div className="space-y-4">
            {currentSchedule.courses.map((c, idx) => (
              <div key={idx} className={`flex flex-col gap-1 p-3 rounded-2xl border transition-colors ${darkMode ? 'bg-black/40 border-stone-800' : 'bg-stone-50 border-stone-100'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-4 rounded-full ${c.color}`}></div>
                  <p className={`text-xs font-bold leading-none font-serif italic ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>{c.courseName}</p>
                </div>
                <div className="flex items-center justify-between mt-1 ml-4 pr-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors ${
                    darkMode 
                      ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50' 
                      : 'text-emerald-900 bg-emerald-50 border-emerald-200'
                  }`}>{c.sectionName}</span>
                  <div className="flex flex-wrap gap-2">
                    {c.slots.map((slot, sIdx) => (
                      <p key={sIdx} className={`text-[9px] uppercase tracking-widest font-mono font-bold transition-colors ${darkMode ? 'text-stone-600' : 'text-stone-600'}`}>
                        {slot.day.substring(0, 3)} {slot.startTime}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={() => onSelect(currentSchedule)}
            className={`mt-8 w-full font-bold py-4 rounded-full text-xs transition-all uppercase tracking-widest flex items-center justify-center gap-2 group shadow-xl ${
              darkMode 
                ? 'bg-stone-200 text-black hover:bg-stone-100 shadow-stone-200/5' 
                : 'bg-stone-900 text-white hover:bg-black shadow-black/10'
            }`}
          >
            Finalize Selection <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
          
          <button 
            onClick={onBack}
            className={`mt-3 w-full font-bold py-3.5 rounded-full text-[10px] transition-colors uppercase tracking-[0.2em] border ${
              darkMode 
                ? 'bg-transparent text-stone-600 border-stone-800 hover:bg-stone-800 hover:text-stone-300' 
                : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200'
            }`}
          >
            Back to Registry
          </button>
        </div>
      </div>

      {/* Main Timetable Content */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {results.map((_, idx) => (
              <button 
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={`px-4 py-2.5 rounded-xl font-bold text-[10px] transition-all uppercase tracking-widest border ${
                  activeIndex === idx 
                    ? (darkMode ? 'bg-stone-200 text-black border-stone-200 shadow-lg shadow-white/5' : 'bg-emerald-900 text-white border-emerald-900 shadow-lg shadow-emerald-900/10')
                    : (darkMode ? 'bg-stone-900 border-stone-800 text-stone-500 hover:bg-stone-800' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50')
                }`}
              >
                Sol {idx + 1}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
             <span className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-stone-600' : 'text-slate-400'}`}>Schedule #{activeIndex + 1}</span>
             <CheckCircle2 className="text-emerald-500" size={16} />
          </div>
        </div>

        <div className={`overflow-x-auto rounded-[2.5rem] border shadow-sm p-8 transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200 shadow-stone-200/5'}`}>
          <div className="min-w-[800px]">
            {/* Calendar Header */}
            <div className={`grid grid-cols-[80px_repeat(7,1fr)] mb-6 border-b pb-4 transition-colors ${darkMode ? 'border-stone-700' : 'border-stone-300'}`}>
              <div className={`text-[10px] uppercase font-bold flex items-center justify-center ${darkMode ? 'text-stone-500' : 'text-stone-900'}`}>Time</div>
              {DAYS.map(day => (
                <div key={day} className="text-center">
                  <div className={`text-[11px] uppercase font-bold tracking-[0.2em] transition-colors ${darkMode ? 'text-stone-400' : 'text-stone-900'}`}>{day.substring(0, 3)}</div>
                </div>
              ))}
            </div>

            {/* Calendar Body */}
            <div className={`relative border-t transition-colors ${darkMode ? 'border-stone-700' : 'border-stone-300'}`}>
              {/* Hour Guides */}
              {hours.map(hour => (
                <div key={hour} className={`grid grid-cols-[80px_repeat(7,1fr)] h-24 border-b relative transition-colors ${darkMode ? 'border-stone-700 last:border-0' : 'border-stone-300 last:border-0'}`}>
                  <div className={`text-[10px] font-bold flex items-center justify-center font-mono tracking-tighter transition-colors ${darkMode ? 'text-stone-500' : 'text-stone-900'}`}>
                    {hour === 12 ? '12:00 PM' : hour > 12 ? `${hour-12}:00 PM` : `${hour}:00 AM`}
                  </div>
                  {DAYS.map(day => (
                    <div key={day} className={`border-l relative h-full transition-colors ${darkMode ? 'border-stone-700' : 'border-stone-300'}`} />
                  ))}
                </div>
              ))}

              {/* Events Overlay */}
              <div className="absolute top-0 left-[80px] right-0 bottom-0 pointer-events-none">
                <div className="grid grid-cols-7 h-full">
                  {DAYS.map(day => (
                    <div key={day} className="relative h-full">
                      {currentSchedule.courses
                        .flatMap(c => c.slots.filter(s => s.day === day).map(s => ({ ...c, slot: s })))
                        .map((c, sIdx) => {
                          const [sh, sm] = c.slot.startTime.split(':').map(Number);
                          const [eh, em] = c.slot.endTime.split(':').map(Number);
                          const rowHeight = 96; // Matching h-24 (96px)
                          const top = ((sh - hours[0]) * 60 + sm) * (rowHeight / 60);
                          const height = ((eh * 60 + em) - (sh * 60 + sm)) * (rowHeight / 60);

                          const baseColor = c.color.replace('bg-', '').replace('-500', '').replace('-800', '').replace('-900', '').replace('-950', '').replace('-600', '');
                          
                          // Dark Mode Styles for Opaque boxes
                          // Enhanced Contrast Colors for Opaque boxes
                          const lightBg = darkMode ? `bg-${baseColor}-900` : `bg-${baseColor}-100`;
                          const textCol = darkMode ? `text-${baseColor}-50` : `text-${baseColor}-950`;
                          const borderCol = darkMode ? `border-${baseColor}-700` : `border-${baseColor}-300`;
                          const barCol = darkMode ? `bg-${baseColor}-400` : `bg-${baseColor}-600`;

                          return (
                            <motion.div 
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              key={sIdx}
                              className={`absolute inset-x-0.5 rounded-lg ${lightBg} ${textCol} border shadow-md z-10 flex overflow-hidden cursor-default group transition-shadow hover:shadow-lg hover:z-20 pointer-events-auto opacity-100 ${borderCol}`}
                              style={{ top: `${top}px`, height: `${height}px` }}
                            >
                              <div className={`w-1 h-full ${barCol} flex-shrink-0`} />
                              <div className="p-1 px-1.5 flex flex-col w-full overflow-hidden leading-[1.1]">
                                <span className={`truncate block font-extrabold text-[9.5px] mb-0.5 ${darkMode ? 'text-white' : ''}`}>{c.courseName}</span>
                                <div className="flex items-center justify-between mt-auto gap-1">
                                  <span className="text-[7.5px] uppercase font-bold opacity-100 truncate">{c.sectionName}</span>
                                  <span className="font-mono text-[7px] shrink-0 opacity-100 font-bold">{c.slot.startTime}</span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AIExtractionPanel({ onCancel, onDataExtracted, darkMode }: { onCancel: () => void, onDataExtracted: (courses: Course[]) => void, darkMode: boolean }) {
  const [courseNameHint, setCourseNameHint] = useState('');
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file: File) => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setFiles(prev => [...prev, ...newFiles]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = [...files];
    URL.revokeObjectURL(newFiles[index].preview);
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const processImages = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      const imagePromises = files.map(f => {
        return new Promise<{ data: string; mimeType: string }>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              data: reader.result as string,
              mimeType: f.file.type
            });
          };
          reader.readAsDataURL(f.file);
        });
      });

      const imageData = await Promise.all(imagePromises);
      const extracted = await extractCoursesFromImages(imageData, courseNameHint);
      
      // Prioritize the user-provided course name hint if AI failed or user wants specific name
      const processed = extracted.map(c => ({
        ...c,
        name: courseNameHint.trim() !== '' 
          ? (c.name && c.name !== "Unknown" ? c.name : courseNameHint) 
          : c.name
      }));

      onDataExtracted(processed);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process images. Please ensure they contain clear timetable text.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`rounded-[2rem] p-8 shadow-xl border overflow-hidden relative transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800 shadow-emerald-400/5' : 'bg-white border-stone-100 shadow-stone-200/5'}`}>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-emerald-400 text-black' : 'bg-emerald-900 text-white'}`}>
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className={`text-xl font-bold font-serif italic leading-none ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}>Scan My Schedule</h3>
            <p className={`text-[10px] uppercase font-bold tracking-widest mt-1 ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>Read multiple screenshots • AI Powered</p>
          </div>
        </div>
        <button 
          onClick={onCancel}
          className={`p-2 rounded-xl transition-all ${darkMode ? 'text-stone-600 hover:text-stone-200 hover:bg-stone-800' : 'text-stone-400 hover:text-rose-500 hover:bg-stone-50'}`}
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <label className={`block text-[10px] font-bold uppercase tracking-widest mb-2 px-1 ${darkMode ? 'text-stone-500' : 'text-stone-600'}`}>Import as Course Name</label>
          <input 
            type="text" 
            value={courseNameHint}
            onChange={(e) => setCourseNameHint(e.target.value)}
            placeholder="e.g. Psychology 101"
            className={`w-full px-5 py-4 border rounded-2xl outline-none transition-all font-bold text-sm ${
              darkMode 
                ? 'bg-black border-stone-800 text-stone-100 focus:border-emerald-900' 
                : 'bg-stone-50 border-stone-100 focus:border-emerald-900'
            }`}
          />
          <p className={`text-[9px] mt-1.5 px-1 font-medium ${darkMode ? 'text-stone-600' : 'text-stone-400'}`}>Hint helps AI identify the correct slots in busy screenshots.</p>
        </div>

        <div 
          className={`border-2 border-dashed rounded-[2rem] p-10 text-center transition-all ${
            files.length > 0 
              ? (darkMode ? 'border-emerald-900 bg-emerald-900/5' : 'border-indigo-200 bg-indigo-50/20') 
              : (darkMode ? 'border-stone-800 bg-stone-900 hover:bg-stone-800' : 'border-slate-200 bg-slate-50 hover:bg-slate-100')
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files) {
              const droppedFiles = Array.from(e.dataTransfer.files).map((file: File) => ({
                file,
                preview: URL.createObjectURL(file)
              }));
              setFiles(prev => [...prev, ...droppedFiles]);
            }
          }}
        >
          <input 
            type="file" 
            id="file-upload" 
            className="hidden" 
            multiple 
            accept="image/*"
            onChange={handleFileChange}
          />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
            <div className={`w-16 h-16 rounded-2xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${darkMode ? 'bg-stone-800 text-stone-600' : 'bg-white text-emerald-900'}`}>
              <Upload size={32} />
            </div>
            <p className={`font-bold font-serif italic ${darkMode ? 'text-stone-400' : 'text-stone-700'}`}>Upload schedule screenshots</p>
            <p className={`text-xs mt-1 font-bold ${darkMode ? 'text-stone-600' : 'text-stone-600'}`}>or click to browse your files</p>
          </label>
        </div>

        {files.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {files.map((file, idx) => (
              <div key={idx} className={`relative group aspect-[4/3] rounded-2xl overflow-hidden shadow-sm border ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                <img src={file.preview} alt="Preview" className="w-full h-full object-cover" />
                <button 
                  onClick={() => removeFile(idx)}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className={`p-4 rounded-2xl flex items-start gap-3 border ${darkMode ? 'bg-rose-950/20 border-rose-900/30 text-rose-400' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <p className="text-xs font-medium leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex gap-4">
          <button 
            onClick={onCancel}
            disabled={isProcessing}
            className={`flex-1 py-4 font-bold uppercase tracking-widest text-[10px] rounded-full transition-all disabled:opacity-50 border ${
              darkMode ? 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700' : 'text-stone-600 hover:bg-stone-50 border-stone-200'
            }`}
          >
            Cancel
          </button>
          <button 
            disabled={files.length === 0 || isProcessing}
            onClick={processImages}
            className={`flex-[2] py-4 rounded-full font-bold shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 overflow-hidden relative group transition-all ${
              darkMode ? 'bg-stone-200 text-black hover:bg-white' : 'bg-emerald-900 text-white hover:bg-emerald-950 shadow-emerald-900/10'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span className="text-xs uppercase tracking-[0.2em]">Processing...</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span className="text-xs uppercase tracking-[0.2em]">Generate Import</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className={`mt-8 flex items-center justify-between px-2 opacity-50 grayscale ${darkMode ? 'text-stone-700' : 'text-stone-500'}`}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} />
          <span className="text-[8px] font-bold uppercase tracking-widest leading-none">AI Schedule Scanner</span>
        </div>
        <div className="flex items-center gap-2">
          <RefreshCw size={14} />
          <span className="text-[8px] font-bold uppercase tracking-widest leading-none">Auto-Conflict Finder</span>
        </div>
      </div>
    </div>
  );
}

function FinalScheduleScreen({ 
  schedule, 
  onBack, 
  onGoToCourses, 
  darkMode 
}: { 
  schedule: Schedule, 
  onBack: () => void, 
  onGoToCourses?: () => void, 
  darkMode: boolean 
}) {
  const [downloading, setDownloading] = useState(false);

  const handleExportPDF = async () => {
    try {
      setDownloading(true);
      const element = document.querySelector('.print-card');
      if (!element) return;
      const opt = {
        margin: 0.3,
        filename: `Scholarly_Timetable.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      await (html2pdf() as any).set(opt).from(element as HTMLElement).save();
    } catch (e) {
      console.error(e);
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  // Sort courses by day and time for a clean printed view
  const sortedSlots = schedule.courses
    .map(c => c.slots.map(s => ({ ...c, slot: s })))
    .flat()
    .sort((a, b) => {
      const dayOrder = DAYS.indexOf(a.slot.day) - DAYS.indexOf(b.slot.day);
      if (dayOrder !== 0) return dayOrder;
      return a.slot.startTime.localeCompare(b.slot.startTime);
    });

  const slotsByDay = DAYS.reduce((acc, day) => {
    const daySlots = sortedSlots.filter(s => s.slot.day === day);
    if (daySlots.length > 0) acc[day] = daySlots;
    return acc;
  }, {} as Record<Day, typeof sortedSlots>);

  return (
    <div className={`max-w-3xl mx-auto space-y-8 pb-20 print-container transition-colors duration-300`}>
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-full border transition-colors ${
              darkMode ? 'text-stone-300 border-stone-800 hover:bg-stone-900' : 'text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            <ArrowLeft size={14} /> Solutions
          </button>
          {onGoToCourses && (
            <button 
              onClick={onGoToCourses} 
              className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-full border transition-colors ${
                darkMode ? 'text-stone-300 border-stone-800 hover:bg-stone-900' : 'text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <BookOpen size={14} /> Edit Courses
            </button>
          )}
        </div>

        <button
          onClick={handleExportPDF}
          disabled={downloading}
          className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-full shadow-sm transition-all ${
            darkMode ? 'bg-stone-200 text-black hover:bg-white' : 'bg-stone-900 text-white hover:bg-black'
          }`}
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span>{downloading ? 'Exporting...' : 'Export PDF'}</span>
        </button>
      </div>

      <div className={`rounded-[32px] border shadow-xl overflow-hidden print-card transition-colors duration-300 ${darkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'}`}>
        <div className={`${darkMode ? 'bg-stone-950 text-white' : 'bg-stone-900 text-white'} p-10`}>
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-3xl font-serif italic mb-2 tracking-tight">Class Timetable</h2>
              <p className={`text-sm font-serif italic ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Conflict-free schedule found for this term</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border flex items-center gap-1.5 ${
                darkMode ? 'bg-emerald-950/60 text-emerald-400 border-emerald-900/60' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span>Active Timetable Saved</span>
              </div>
              <span className={`text-[9px] uppercase tracking-wider ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>Automatically retained across sessions</span>
            </div>
          </div>
          
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-8 pt-8 border-t transition-colors ${darkMode ? 'border-stone-900' : 'border-stone-800'}`}>
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-[0.2em] mb-2 ${darkMode ? 'text-stone-700' : 'text-stone-500'}`}>Total Courses</p>
              <p className={`text-2xl font-serif italic ${darkMode ? 'text-stone-100' : 'text-white'}`}>{schedule.courses.length}</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-[0.2em] mb-2 ${darkMode ? 'text-stone-700' : 'text-stone-500'}`}>Weekly Classes</p>
              <p className={`text-2xl font-serif italic ${darkMode ? 'text-stone-100' : 'text-white'}`}>{sortedSlots.length}</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-[0.2em] mb-2 ${darkMode ? 'text-stone-700' : 'text-stone-500'}`}>Conflicts</p>
              <p className={`text-2xl font-serif italic ${darkMode ? 'text-emerald-400' : 'text-emerald-400'}`}>Fixed</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-[0.2em] mb-2 ${darkMode ? 'text-stone-700' : 'text-stone-500'}`}>Date</p>
              <p className={`text-2xl font-mono ${darkMode ? 'text-stone-500' : 'text-stone-300'}`}>
                {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </p>
            </div>
          </div>
        </div>

        <div className={`p-10 space-y-12 transition-colors duration-300 ${darkMode ? 'bg-black/20' : 'bg-white'}`}>
          {DAYS.map(day => slotsByDay[day] && (
            <div key={day} className="space-y-5">
              <div className="flex items-center gap-6">
                <h3 className={`text-2xl font-serif italic min-w-[120px] font-bold ${darkMode ? 'text-stone-100' : 'text-stone-950'}`}>{day}</h3>
                <div className={`h-px flex-grow ${darkMode ? 'bg-stone-800' : 'bg-stone-200'}`}></div>
              </div>
              <div className="space-y-4">
                {slotsByDay[day].map((item, idx) => (
                  <div key={idx} className={`flex items-center gap-8 p-6 rounded-[2rem] border transition-all group overflow-hidden relative shadow-sm ${
                    darkMode 
                      ? 'bg-stone-900/50 border-stone-800 hover:border-stone-700 hover:bg-stone-900' 
                      : 'bg-white border-stone-200 hover:border-stone-300 hover:shadow-lg'
                  }`}>
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.color}`}></div>
                    <div className={`min-w-[140px] font-mono text-xs border-r pr-6 pl-2 transition-colors ${darkMode ? 'text-stone-400 border-stone-800' : 'text-stone-700 border-stone-200'}`}>
                       <div className="flex items-center gap-2 mb-1">
                        <Clock size={12} className={darkMode ? 'text-stone-600' : 'text-stone-600'} />
                        <span className={`font-bold ${darkMode ? 'text-stone-200' : 'text-stone-900'}`}>{item.slot.startTime}</span>
                       </div>
                       <div className={`text-[10px] font-serif italic font-bold ${darkMode ? 'text-stone-600' : 'text-stone-700'}`}>until {item.slot.endTime}</div>
                    </div>
                    <div className="flex items-center gap-4 flex-grow">
                      <div>
                        <p className={`font-serif italic font-bold text-xl leading-tight mb-2 tracking-tight transition-colors ${darkMode ? 'text-stone-100' : 'text-stone-950'}`}>{item.courseName}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-widest border transition-colors ${
                            darkMode 
                              ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/40' 
                              : 'text-emerald-800 bg-emerald-50 border-emerald-100/50'
                          }`}>{item.sectionName}</span>
                          <span className={`text-[10px] font-serif italic font-bold ${darkMode ? 'text-stone-600' : 'text-stone-700'}`}>Standard Session</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className={`p-10 border-t text-center transition-colors ${darkMode ? 'bg-stone-950 border-stone-900' : 'bg-stone-50/30 border-stone-100'}`}>
          <p className={`text-[9px] uppercase tracking-[0.4em] font-bold ${darkMode ? 'text-stone-700' : 'text-stone-400'}`}>
            Generated with Scholarly Optimization Engine
          </p>
        </div>
      </div>
    </div>
  );
}
