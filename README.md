# PediaSafe
Pneumonia Readmission Risk Assessment Tool


Act as an expert Full Stack Developer proficient in Next.js 14 (App Router), Tailwind CSS, shadcn/ui, and Hono.

I am building a healthcare web application called "PEDIA SAFE Model", a Pneumonia Readmission Risk Assessment Tool. I already have a Next.js 14 project setup with shadcn/ui. 

Please generate the code for the two core features below. Include the necessary React UI components (using shadcn/ui conventions like Card, Form, RadioGroup, Table, Badge) and the Hono API route structure.

### Feature 1: Risk Assessment Form (Data Entry)
Create a comprehensive form page for nurses to evaluate a patient's risk. 

**Fields required:**
1. Patient Information: Patient Name, Age, HN (Hospital Number), Assessment Date, Assessor Name, Caregiver's Phone Number.
2. Risk Assessment (4 Domains). Each domain should be a RadioGroup with values 0 to 3:
   - Domain 1: Clinical Severity (Options: No complications = 0, High fever > 38.5°C = 1, O2 Sat < 95% = 2, Complications = 3)
   - Domain 2: Host Factors (Options: No risk factors = 0, Underweight = 1, Premature/LBW = 2, Underlying disease = 3)
   - Domain 3: Caregiver Competency (Options: Fully understands = 0, Forgets some parts = 1, Needs repeated teaching = 2, Poor communication = 3)
   - Domain 4: Environment (Options: Appropriate home = 0, Smoker in house = 1, Crowded house = 2, Poor healthcare access = 3)
3. Discharge Teaching Record (Checkboxes): Medication administration, 5 Danger signs, Tepid sponging, Chest percussion/Suction, Avoid smoking.

**Auto-Calculation Logic (Real-time UI update):**
- Calculate the `Total Score` (0-12) reactively as the user selects the radio buttons.
- Display the `Risk Level` dynamically based on the total score:
  - 0-3: Low Risk (Green badge, Standard discharge + 1 Follow-up call)
  - 4-7: Moderate Risk (Yellow badge, Follow-up call at 48-72 hrs & Day 7)
  - 8-12: High Risk (Red badge, Consult Pediatrician + Urgent F/U)

### Feature 2: Monitoring Dashboard
Create a dashboard view for nurses to monitor and manage patients.

**UI Requirements:**
- A Data Table (shadcn Table) displaying a list of assessed patients.
- Columns: HN, Patient Name, Assessment Date, Total Score, Risk Level (use colored Badges), and Next Follow-up Action.
- Include a Filter/Select component above the table to filter patients by "Risk Level" (e.g., Show only Moderate and High Risk).

Please provide the TypeScript interfaces for the patient data, the Next.js page layouts for both features, and a mock Hono API route (`app.post('/api/assessments')` and `app.get('/api/patients')`) to handle this data.