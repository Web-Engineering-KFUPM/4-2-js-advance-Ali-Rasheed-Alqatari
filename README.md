[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/J0-Up346)
# Advance JavaScript — Lab

## Overview
This lab, titled *Advance JavaScript*, is designed to help you practice important concepts beyond the basics of JavaScript. You will complete tasks involving objects with getters and setters, using objects as maps, working with strings and dates, finding min and max values with arrays, handling exceptions, and using regular expressions. Each task includes TODOs and starter code that you must uncomment and complete. The goal is to strengthen your understanding of these core features and prepare you for quizzes and future projects. 

> **Major portions of the quiz will come from the _Reading Assignment_ below. Read carefully!**

## Reading Assignment (zyBooks — Chapter 4 excerpts)
- **[4.9 Objects](https://learn.zybooks.com/zybook/SWE363Fall2025/chapter/4/section/9)** — How to create objects and pass them to functions.
- **[4.10 Common object map operations](https://learn.zybooks.com/zybook/SWE363Fall2025/chapter/4/section/10)** — Treating objects as maps and iterating their keys/values.
- **[Table 4.11.1: Common String methods](https://learn.zybooks.com/zybook/SWE363Fall2025/chapter/4/section/11)** — Reference for string operations used in this lab.
- **[4.12 Different Date methods](https://learn.zybooks.com/zybook/SWE363Fall2025/chapter/4/section/12)** — Working with dates and time components.
- **[4.13 Common Math methods](https://learn.zybooks.com/zybook/SWE363Fall2025/chapter/4/section/13)** — Useful numeric helpers (e.g., `Math.min`, `Math.max`, `Math.round`).
- **[4.14 Exception Handling](https://learn.zybooks.com/zybook/SWE363Fall2025/chapter/4/section/14)** — Throwing and handling errors with `try/catch/finally`.
- **[4.15 Regular Expressions](https://learn.zybooks.com/zybook/SWE363Fall2025/chapter/4/section/15?content_resource_id=114962149)** — Special characters, character ranges, and metacharacters.

> Links point to zyBooks. Use your course’s book instance to navigate to the exact sections.

---

## What You’ll Practice in This Lab
1. Creating objects, using **getters** and **setters**.
2. Using an **object as a map** and iterating with **`for...in`**.
3. **String** fundamentals: `.charAt()` and `.length`.
4. **Date** basics: getting **day**, **month**, and **year**.
5. Arrays + **spread operator** to find **min**/**max**.
6. **Exception handling** with `try`, `catch`, and `finally`.
7. **Regular expressions** with `.test()` and `Array.prototype.forEach()`.

---

## Concepts & Code Syntax

### 1) Objects with Getters & Setters
An **object** groups related data and behavior. A **getter** looks like a property but runs code when you read it (useful for computed values such as a full name). A **setter** runs code when you assign to a property (useful for checking or cleaning the input before saving).

Why use them?
- Keep your data **valid** (for example, GPA must be between 0 and 4).
- Provide a **friendly API** (read `person.fullName` like a normal property, not a function call).

**Code Syntax:**
```js
const person = {
  first: "Ada",
  last: "Lovelace",
  _gpa: 3.8,             // underscore means "internal field" by convention
  get fullName() {       // computed when read
    return this.first + " " + this.last;
  },
  get gpa() {            // safe read access
    return this._gpa;
  },
  set gpa(value) {       // safe write access with validation
    if (value >= 0 && value <= 4) {
      this._gpa = value;
    }
  }
};
// Use like normal properties: person.fullName; person.gpa; person.gpa = 3.9;
```

You can also define the same idea in a **class**, which is helpful when making many similar objects:
```js
class Student {
  constructor(first, last, gpa) {
    this.first = first;
    this.last = last;
    this._gpa = gpa;
  }
  get fullName() { return `${this.first} ${this.last}`; }
  get gpa() { return this._gpa; }
  set gpa(v) { if (v >= 0 && v <= 4) this._gpa = v; }
}
```

**Key tips:**
- Use `this` to refer to the current object.
- Backing fields (like `_gpa`) are a **convention**, not enforced by JavaScript, but they make your intent clear.

---

### 2) Object as Map + `for...in`
A plain object can work like a small database (a “map”) where each **key** points to a **value**. The `for...in` loop goes through all **enumerable keys** of the object.

**Code Syntax:**
```js
const courseTitles = { A101: "Intro", A201: "Data Structures" };

for (const key in courseTitles) {
  // key will be "A101", then "A201", ...
  // value is courseTitles[key]
}
```
**Good to know:**
- `for...in` gives you the **keys**. If you only want values or both key and value:
  - `Object.keys(obj)` → array of keys
  - `Object.values(obj)` → array of values
  - `Object.entries(obj)` → array of [key, value] pairs

---

### 3) String: `charAt()` and `length`
A **string** is text. Two simple but important properties/methods:
- `str.length` → how many UTF‑16 code units the string has (commonly felt as “characters”).  
- `str.charAt(i)` → the character at position `i` (first character is at index 0).

**Code Syntax:**
```js
const str = "Hello";
str.length;     // 5
str.charAt(0);  // "H"
str.charAt(4);  // "o"
```

**Tip:** If you try to read beyond the end (`str.charAt(100)`), you get an empty string.

---

### 4) Date: day, month, year
`new Date()` creates an object representing **now** (your system’s current date and time). You can read parts of the date with getter methods:

**Code Syntax:**
```js
const d = new Date();
d.getDate();      // Day of month: 1–31
d.getMonth();     // Month index: 0–11  (0 = January, 11 = December)
d.getFullYear();  // 4-digit year, e.g., 2025
```

**Common mistake:** `getMonth()` is **zero-based**. Add 1 if you want the human month (Jan = 1).

---

### 5) Arrays + Spread for Min/Max
The **spread operator** (`...`) “opens” an array into separate arguments. That lets you pass all items to `Math.min` and `Math.max` quickly.

**Code Syntax:**
```js
const nums = [10, 2, 30];
const min = Math.min(...nums);  // same as Math.min(10, 2, 30)
const max = Math.max(...nums);
```

**Tip:** Your lab asks for exactly 10 numbers. You can choose any 10 values.

---

### 6) Exceptions: `try` / `catch` / `finally`
Sometimes code **fails** (bad input, missing data). You can **throw** an error and **catch** it so the program does not stop. The `finally` block **always runs**, whether there was an error or not—use it for cleanup or a final message.

**Code Syntax:**
```js
function firstItem(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("Array must be non-empty.");
  }
  return arr[0];
}

try {
  const x = firstItem([]);   // This will throw
} catch (e) {
  // Handle or log the error here
} finally {
  // This block always runs
}
```

**Tip:** Use clear error messages so it’s obvious what went wrong.

---

### 7) Regular Expressions + `.test()` + `.forEach()`
A **regular expression (regex)** describes a text pattern. The pattern `/ab/` means: “find the letters `a` followed by `b` anywhere in the word.”  
- `.test(text)` returns **true/false** depending on whether the text matches the pattern.
- `.forEach()` lets you loop through each array element in a clean way.

**Code syntax:**
```js
const words = ["cat", "rabbit", "dragon", "caterpillar"];
const re = /cat/;

words.forEach(w => {
  if (re.test(w)) {
    // console.log(`${w} matches!`);
  }
});
```
**Idea:** For the words above, any word that contains `cat` should be reported as a match.

---

## Loop Reference (When to Use What) 
- **`for...in`**: Loops over **keys** (property names) in an **object**.  
- **`for...of`**: Loops over **values** in any **iterable** (arrays, strings, Maps, Sets).  
- **`array.forEach(callback)`**: Calls your function for each item in the array; very readable for simple “do something for each item” tasks.

**Syntax recap:**
```js
for (const key in obj) { /* obj[key] */ }
for (const value of array) { /* value */ }

array.forEach((value, index) => { /* ... */ });
```

---

## What to Submit
- Your updated `script.js` with all TODOs completed.
- Use `console.log()` to show your results in the browser Console.

## Checklist
- [ ] I created an object with a **getter** and **setter**, and logged the results.
- [ ] I made an object that works like a **map** and looped over it with `for...in`.
- [ ] I used string `.charAt()` and `.length`.
- [ ] I used `Date` to print day, month, and year (remember: month is 0–11).
- [ ] I found **min** and **max** with the spread operator.
- [ ] I handled an error using `try/catch/finally`.
- [ ] I used a **regex** with `.test()` and `.forEach()` to find words containing `"ab"`.
- [ ] My code runs without errors and has clear comments.
