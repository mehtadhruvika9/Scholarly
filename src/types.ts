/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Day {
  Monday = "Monday",
  Tuesday = "Tuesday",
  Wednesday = "Wednesday",
  Thursday = "Thursday",
  Friday = "Friday",
  Saturday = "Saturday",
  Sunday = "Sunday",
}

export interface TimeSlot {
  day: Day;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export interface Section {
  id: string;
  name: string;
  slots: TimeSlot[];
}

export interface Course {
  id: string;
  name: string;
  color: string;
  sections: Section[];
}

export interface UserProfile {
  id: string;
  name: string;
  semester: number;
  avatarIcon: string;
}

export interface Schedule {
  id: string;
  courses: {
    courseId: string;
    courseName: string;
    sectionName: string;
    color: string;
    slots: TimeSlot[];
  }[];
}
