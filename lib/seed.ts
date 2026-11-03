import type { Profile, Project } from "./types";

export const seedProfile: Profile = {
  name: "Raju Bandam",
  title: "Software Engineer • AI/ML",
  phone: "+91 9121455643",
  email: "rajubandam694@gmail.com",
  github: "github.com/rajureddi",
  linkedin: "linkedin.com/in/rajureddie",
  portfolio: "rajureddie.site",
  summary:
    "Motivated Computer Science and Engineering (AIML) student with strong hands-on experience building real-time intelligent systems and full-stack applications end to end. Skilled in Python, Java, React, Flask and deep learning / ML, with a strong command of data structures, algorithms and cloud deployment.",
  education: [
    {
      title: "B.Tech — Computer Science and Engineering (AIML)",
      org: "Malla Reddy University, Hyderabad",
      period: "2022–2026",
      detail: "CGPA: 8.6",
    },
    {
      title: "Intermediate — MPC",
      org: "SR Junior College",
      period: "2020–2022",
      detail: "90.1%",
    },
    {
      title: "SSC",
      org: "ZPSS T/EM Chennur",
      period: "2020",
      detail: "CGPA: 10",
    },
  ],
  skillGroups: [
    { label: "Languages", items: ["Python", "Java", "JavaScript", "Kotlin"] },
    {
      label: "Frameworks",
      items: ["React", "Next.js", "Flask", "Node.js", "FastAPI", "KivyMD"],
    },
    {
      label: "ML/AI",
      items: [
        "TensorFlow",
        "PyTorch",
        "Scikit-learn",
        "OpenCV",
        "Hugging Face",
        "NLP",
        "Computer Vision",
        "Transformers",
        "YOLO",
        "Deep Learning",
        "Machine Learning",
      ],
    },
    { label: "Tools", items: ["Git", "GitHub", "MySQL", "REST APIs", "AWS"] },
  ],
  certifications: [
    "NPTEL Certification — Java Programming",
    "Machine Learning Specialization — DeepLearning.AI",
    "AWS Cloud Practitioner — AWS Academy Cloud Foundations",
    "Front-End Developer Certificate — Meta",
    "Google Crash Course on Python (2024)",
  ],
  coursework: [
    "DSA",
    "Algorithms",
    "DBMS",
    "AI/ML",
    "Deep Learning",
    "NLP",
    "Computer Vision",
    "Full-Stack Development",
    "Data Analytics",
  ],
};

const gh = (repo: string) => `https://github.com/rajureddi/${repo}`;

export const seedProjects: Project[] = [
  {
    id: "visionaid",
    title: "VisionAid++ — On-Device Multimodal AI",
    year: "2026",
    description:
      "On-device multimodal AI system for blind navigation and low-vision enhancement — offline, privacy-preserving assistive technology powered by C++ inference. IEEE Publication 2026.",
    tags: ["Kotlin", "Android", "OpenCV", "MNN", "TensorFlow Lite", "OCR", "NLP", "Hugging Face", "Computer Vision", "VLLM", "Text-to-Speech"],
    domains: ["Computer Vision", "On-Device AI", "Android", "AI/ML"],
    github: gh("On-Device-MultiModel-Ai-for-blind-navigation-and-low-vision-enhancement"),
    highlight: "IEEE Publication 2026",
    bullets: [
      "Developed an Android assistive AI application providing real-time blind navigation, low-vision enhancement, OCR and voice guidance fully on-device for privacy and low latency",
      "Integrated Vision-Language Models (VLLMs) to analyse live camera feeds and generate safe navigation instructions — obstacle alerts, distance awareness and path guidance via Text-to-Speech",
      "Built low-vision accessibility modes for glaucoma, macular degeneration, diabetic retinopathy and retinitis pigmentosa, plus high-contrast, night-vision and dynamic zoom enhancement",
    ],
  },
  {
    id: "smart-traffic",
    title: "AI-Based Smart Traffic Management System",
    year: "2025",
    description:
      "AI-based system using YOLO for real-time vehicle density analysis and dynamic signal control, with emergency vehicle preemption and a live monitoring dashboard.",
    tags: ["YOLO", "OpenCV", "Python", "FastAPI", "React", "TailwindCSS", "OCR", "ANPR", "Computer Vision"],
    domains: ["Computer Vision", "AI/ML", "Full-Stack"],
    github: gh("Smart-AI-Based-Traffic-Management-System"),
    bullets: [
      "Developed an adaptive traffic control system that dynamically optimises green-light durations using real-time vehicle density analysis from multiple camera feeds",
      "Implemented emergency vehicle preemption to detect ambulances and fire trucks and automatically prioritise lane clearance during traffic cycles",
      "Built red-light violation detection using ANPR (EasyOCR) and a live dashboard with FastAPI and React for monitoring traffic analytics",
    ],
  },
  {
    id: "turantpay",
    title: "TurantPay — Offline UPI App",
    year: "2025",
    description:
      "Offline UPI payment solution enabling secure transactions without internet access using USSD (*99#).",
    tags: ["Android", "FinTech", "USSD", "Payments", "Mobile Development"],
    domains: ["FinTech", "Android"],
    github: gh("TurantPay"),
    bullets: [
      "Built an offline UPI payment application enabling secure transactions without internet access using USSD (*99#)",
      "Designed the payment flow for low-connectivity scenarios with a simple, fast Android user experience",
    ],
  },
  {
    id: "voice2sign",
    title: "Voice2Sign",
    year: "2025",
    description:
      "AI-powered accessibility tool converting spoken language to sign language animations using deep learning.",
    tags: ["Deep Learning", "Computer Vision", "NLP", "Python", "Accessibility"],
    domains: ["AI/ML", "Computer Vision", "NLP"],
    github: gh("voice2sign"),
    bullets: [
      "Built an AI accessibility tool that converts spoken language into sign language animations using deep learning",
      "Designed the speech-to-animation pipeline to make spoken content accessible to deaf and hard-of-hearing users",
    ],
  },
  {
    id: "backlog-wallah",
    title: "Backlog Wallah — Learning Support App",
    year: "2023",
    description:
      "Python-based Android learning application built with KivyMD to help B.Tech students clear academic backlogs with syllabus, materials and recorded classes.",
    tags: ["Python", "KivyMD", "Android"],
    domains: ["Android", "Full-Stack"],
    github: gh("BACKLOG-WALLAH-"),
    bullets: [
      "Developed an Android education-support app using Python and the KivyMD library, giving students access to syllabus, study materials and recorded classes for clearing backlogs",
    ],
  },
  {
    id: "bert-ner",
    title: "Named Entity Recognition (BERT)",
    year: "2024",
    description:
      "BERT-based NER system trained on the CoNLL-2003 dataset for entity extraction from unstructured text, deployed on AWS EC2 with a React frontend.",
    tags: ["BERT", "Transformers", "Hugging Face", "PyTorch", "NLP", "Python", "Flask", "React", "AWS"],
    domains: ["NLP", "AI/ML", "Full-Stack", "Cloud"],
    github: gh("NER-BERT"),
    bullets: [
      "Developed a BERT-based Named Entity Recognition system using Transformers, Hugging Face and PyTorch to extract names, locations, organisations and dates from unstructured text",
      "Designed a React frontend for dynamic entity filtering and batch document processing, and deployed the service on AWS EC2",
    ],
  },
  {
    id: "plant-ai",
    title: "Plant AI",
    year: "2024",
    description:
      "Deep learning plant disease detection using CNNs and ResNet34 with 98% accuracy.",
    tags: ["CNN", "ResNet34", "Deep Learning", "Computer Vision", "PyTorch", "Python"],
    domains: ["Computer Vision", "AI/ML"],
    github: gh("PlantAI"),
    bullets: [
      "Built a deep learning plant disease detection system using CNNs and ResNet34, achieving 98% classification accuracy",
      "Trained and evaluated the model on leaf image datasets with augmentation to improve generalisation",
    ],
  },
  {
    id: "aura-hub",
    title: "AuraOnDevice AI HUB",
    year: "2025",
    description:
      "On-device multimodal LLM Android app powered by MNN and MediaPipe inference — offline chat, vision and RAG without any cloud dependency.",
    tags: ["Android", "Kotlin", "MNN", "MediaPipe", "LLM", "RAG", "On-Device AI"],
    domains: ["On-Device AI", "Android", "AI/ML"],
    github: gh("AuraOnDevice-AI_HUB"),
    bullets: [
      "Built an on-device multimodal LLM Android application powered by MNN and MediaPipe inference, supporting offline chat, vision and RAG with no cloud dependency",
      "Engineered the inference pipeline to run large language models fully on mobile hardware with low latency",
    ],
  },
  {
    id: "localmind",
    title: "LocalMind — On-Device LLM",
    year: "2025",
    description:
      "Run large language models fully on mobile hardware — a privacy-first, offline inference engine for Android.",
    tags: ["Android", "Kotlin", "LLM", "On-Device AI", "Inference"],
    domains: ["On-Device AI", "Android", "AI/ML"],
    github: gh("LocalMind"),
    bullets: [
      "Built a privacy-first offline LLM inference engine that runs large language models fully on Android hardware",
      "Optimised on-device inference so conversations never leave the device",
    ],
  },
  {
    id: "depthsight",
    title: "DepthSightAI",
    year: "2025",
    description:
      "Android application combining real-time object detection with depth estimation using ARCore — lightweight, on-device spatial awareness.",
    tags: ["Android", "ARCore", "Object Detection", "Depth Estimation", "Computer Vision", "On-Device AI"],
    domains: ["Computer Vision", "On-Device AI", "Android"],
    github: gh("depthsightai"),
    bullets: [
      "Built an Android application combining real-time object detection with depth estimation using ARCore for on-device spatial awareness",
      "Designed the system to stay lightweight enough for edge scenarios on mobile hardware",
    ],
  },
  {
    id: "fraud-detection",
    title: "E-Payment Fraud Detection",
    year: "2025",
    description:
      "AI-powered e-payment fraud detection system that analyses transaction patterns in real time to flag suspicious activity and protect digital payments.",
    tags: ["Machine Learning", "Python", "FinTech", "Fraud Detection", "Data Analytics"],
    domains: ["FinTech", "AI/ML", "Data"],
    github: gh("epapyment"),
    bullets: [
      "Built an AI-powered fraud detection system that analyses e-payment transaction patterns in real time to flag suspicious activity",
      "Designed features from transaction behaviour to protect digital payments from fraud",
    ],
  },
  {
    id: "ambulance-detection",
    title: "Emergency Ambulance Detection",
    year: "2025",
    description:
      "Fine-tuned YOLO model for real-time emergency vehicle detection (ambulances, fire engines, police cars) enabling smart traffic priority systems.",
    tags: ["YOLO", "Computer Vision", "Deep Learning", "Object Detection", "Python"],
    domains: ["Computer Vision", "AI/ML"],
    github: gh("ambulance-detection-Emergency-vechiles-deetection"),
    bullets: [
      "Fine-tuned a YOLO model for real-time detection of emergency vehicles — ambulances, fire engines and police cars",
      "Enabled smart traffic priority systems that clear lanes automatically when an emergency vehicle is detected",
    ],
  },
  {
    id: "votersetu",
    title: "VoterSetu",
    year: "2025",
    description:
      "Civic-tech platform bridging voters and electoral services — simplifying voter registration, information lookup and electoral awareness.",
    tags: ["Android", "Civic Tech", "Mobile Development"],
    domains: ["Android", "Full-Stack"],
    github: gh("votersetu"),
    bullets: [
      "Built a civic-tech platform that simplifies voter registration, electoral information lookup and voter awareness for citizens",
    ],
  },
  {
    id: "face-attendance",
    title: "Face Recognition Attendance System",
    year: "2024",
    description:
      "Python-based automated attendance system using face recognition — detects and identifies faces in real time to log attendance with zero manual effort.",
    tags: ["Python", "Face Recognition", "Computer Vision", "OpenCV", "Deep Learning"],
    domains: ["Computer Vision", "AI/ML"],
    github: gh("FACE_RECOGNITION_BASED_ATTENDANCE"),
    bullets: [
      "Built an automated attendance system using face recognition that detects and identifies faces in real time to log attendance with zero manual effort",
    ],
  },
  {
    id: "marketmind-pro",
    title: "MarketMind Pro — AI Stock Prediction Platform",
    year: "2026",
    description:
      "Full-stack AI platform that scans the entire Indian stock market (NSE/BSE), predicts prices 7 days ahead with walk-forward backtested ML, and allocates picks to a budget.",
    tags: ["FastAPI", "React", "TypeScript", "Python", "Machine Learning", "Backtesting", "FinTech"],
    domains: ["Full-Stack", "AI/ML", "FinTech", "Data"],
    github: "",
    bullets: [
      "Built a full-stack stock prediction platform (FastAPI + React) scanning ~8,000 NSE/BSE stocks with candlestick-pattern and technical analysis scoring",
      "Implemented walk-forward backtesting with a quality gate so only models that beat a naive baseline produce predictions, with per-pick backtested accuracy shown honestly",
    ],
  },
];
