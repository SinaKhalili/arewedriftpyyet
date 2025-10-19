import React, { useState, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/themes/prism-tomorrow.css";
import { ComicText } from "@/components/ui/comic-text";
import { RetroGrid } from "./ui/retro-grid";
import { HyperText } from "./ui/hyper-text";
import Tilt from "react-parallax-tilt";

interface Method {
  name: string;
  kind: string;
  parameters?: Array<{ name: string; type: string }>;
  returns?: string;
  isAsync?: boolean;
  decorators?: string[];
  line?: number;
  startLine?: number;
  endLine?: number;
}

interface Class {
  name: string;
  file: string;
  methods: Method[];
  abstract?: boolean;
  extends?: string;
  implements?: string[];
  line?: number;
  startLine?: number;
  endLine?: number;
}

interface SDKData {
  classes: Class[];
}

interface SDKComparisonProps {
  tsData: SDKData;
  pythonData: SDKData;
}

export default function SDKComparison({
  tsData,
  pythonData,
}: SDKComparisonProps) {
  const [showCommon, setShowCommon] = useState(true);
  const [showTsOnly, setShowTsOnly] = useState(false);
  const [showPythonOnly, setShowPythonOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hideEmptyClasses, setHideEmptyClasses] = useState(true);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(
    new Set()
  );
  const [hoveredClass, setHoveredClass] = useState<string | null>(null);
  const [expandedCodeSnippets, setExpandedCodeSnippets] = useState<Set<string>>(
    new Set()
  );
  const [codeSnippets, setCodeSnippets] = useState<
    Map<
      string,
      {
        content: string;
        file: string;
        line: number;
        language: string;
        fullContent?: string;
        startLine?: number;
        endLine?: number;
      }
    >
  >(new Map());
  const [loadingSnippets, setLoadingSnippets] = useState<Set<string>>(
    new Set()
  );
  const [expandedSnippets, setExpandedSnippets] = useState<Set<string>>(
    new Set()
  );
  const [hideCommonMethods, setHideCommonMethods] = useState<Set<string>>(
    new Set()
  );
  const [sortByLength, setSortByLength] = useState<Set<string>>(new Set());
  const [showLongestMethod, setShowLongestMethod] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showRatioLeaderboard, setShowRatioLeaderboard] = useState(false);
  const [showTsRatioLeaderboard, setShowTsRatioLeaderboard] = useState(false);

  const tsColumnRef = useRef<HTMLDivElement>(null);
  const pythonColumnRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  const tsClassesMap = new Map(tsData.classes.map((cls) => [cls.name, cls]));
  const pythonClassesMap = new Map(
    pythonData.classes.map((cls) => [cls.name, cls])
  );

  const allClassNames = new Set([
    ...tsData.classes.map((cls) => cls.name),
    ...pythonData.classes.map((cls) => cls.name),
  ]);

  const sortedClassNames = Array.from(allClassNames).sort((a, b) => {
    const tsClassA = tsClassesMap.get(a);
    const pythonClassA = pythonClassesMap.get(a);
    const tsClassB = tsClassesMap.get(b);
    const pythonClassB = pythonClassesMap.get(b);

    // Calculate total method count for each class
    const methodCountA =
      (tsClassA?.methods.filter((m) => m.name !== "constructor").length || 0) +
      (pythonClassA?.methods.length || 0);
    const methodCountB =
      (tsClassB?.methods.filter((m) => m.name !== "constructor").length || 0) +
      (pythonClassB?.methods.length || 0);

    // Sort by method count (descending), then alphabetically
    if (methodCountA !== methodCountB) {
      return methodCountB - methodCountA;
    }
    return a.localeCompare(b);
  });

  const filteredClassNames = sortedClassNames.filter((className) => {
    const tsClass = tsClassesMap.get(className);
    const pythonClass = pythonClassesMap.get(className);

    if (hideEmptyClasses) {
      const tsMethodCount = tsClass?.methods.length || 0;
      const pythonMethodCount = pythonClass?.methods.length || 0;
      if (tsMethodCount === 0 && pythonMethodCount === 0) {
        return false;
      }
    }

    let matchesToggle = false;
    if (tsClass && pythonClass && showCommon) {
      matchesToggle = true;
    } else if (tsClass && !pythonClass && showTsOnly) {
      matchesToggle = true;
    } else if (!tsClass && pythonClass && showPythonOnly) {
      matchesToggle = true;
    }

    const text = `${className} ${
      tsClass?.methods.map((m) => m.name).join(" ") || ""
    } ${pythonClass?.methods.map((m) => m.name).join(" ") || ""}`.toLowerCase();
    const matchesSearch =
      !searchTerm || text.includes(searchTerm.toLowerCase());

    return matchesToggle && matchesSearch;
  });

  const handleScroll = (
    sourceRef: React.RefObject<HTMLDivElement>,
    targetRef: React.RefObject<HTMLDivElement>
  ) => {
    if (!isScrollingRef.current && sourceRef.current && targetRef.current) {
      isScrollingRef.current = true;
      targetRef.current.scrollTop = sourceRef.current.scrollTop;
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 50);
    }
  };

  const toggleClass = (className: string) => {
    setExpandedClasses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(className)) {
        newSet.delete(className);
      } else {
        newSet.add(className);
      }
      return newSet;
    });
  };

  const getCleanFilePath = (filePath: string, sdkName: string): string => {
    if (sdkName === "ts") {
      return filePath.replace(/^protocol-v2\/sdk\/src\//, "");
    } else {
      return filePath.replace(/^driftpy\//, "");
    }
  };

  const toCamelCase = (str: string): string => {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  };

  const highlightCode = (code: string, language: string): string => {
    try {
      if (language === "typescript") {
        return Prism.highlight(code, Prism.languages.typescript, "typescript");
      } else if (language === "python") {
        return Prism.highlight(code, Prism.languages.python, "python");
      }
      return code;
    } catch (error) {
      console.error("Failed to highlight code:", error);
      return code;
    }
  };

  const fetchCodeSnippet = async (
    filePath: string,
    startLine: number,
    endLine: number,
    sdkName: string,
    key: string
  ) => {
    setLoadingSnippets((prev) => new Set(prev).add(key));
    try {
      const cleanPath = getCleanFilePath(filePath, sdkName);
      const repo = sdkName === "ts" ? "protocol-v2" : "driftpy";
      const branch = sdkName === "ts" ? "sdk/src" : "src/driftpy";

      const response = await fetch(
        `https://api.github.com/repos/drift-labs/${repo}/contents/${branch}/${cleanPath}`
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      const content = atob(data.content);
      const lines = content.split("\n");

      const snippetStart = Math.max(0, startLine - 1);
      const snippetEnd = Math.min(lines.length, endLine);
      const snippetLines = lines.slice(snippetStart, snippetEnd);

      setCodeSnippets((prev) =>
        new Map(prev).set(key, {
          content: snippetLines.join("\n"),
          file: cleanPath,
          line: startLine,
          language: sdkName === "ts" ? "typescript" : "python",
          fullContent: content,
          startLine: snippetStart + 1,
          endLine: snippetEnd,
        })
      );
    } catch (error) {
      console.error("Failed to fetch code snippet:", error);
    } finally {
      setLoadingSnippets((prev) => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  };

  const toggleCodeSnippet = (
    key: string,
    filePath: string,
    startLine: number,
    endLine: number,
    sdkName: string,
    className: string,
    methodName: string
  ) => {
    const newExpanded = new Set(expandedCodeSnippets);
    const isExpanding = !newExpanded.has(key);

    if (isExpanding) {
      newExpanded.add(key);
      if (!codeSnippets.has(key)) {
        fetchCodeSnippet(filePath, startLine, endLine, sdkName, key);
      }

      // Also expand the corresponding method on the other side
      const otherSdkName = sdkName === "ts" ? "python" : "ts";
      const otherClass =
        otherSdkName === "ts"
          ? tsClassesMap.get(className)
          : pythonClassesMap.get(className);

      if (otherClass) {
        // Find the corresponding method
        const normalizedMethodName =
          otherSdkName === "python" ? toCamelCase(methodName) : methodName;
        const otherMethod = otherClass.methods.find((m) =>
          otherSdkName === "python"
            ? toCamelCase(m.name) === normalizedMethodName
            : m.name === normalizedMethodName
        );

        if (otherMethod) {
          const otherKey = `${otherSdkName}-${className}-${otherMethod.name}`;
          if (!newExpanded.has(otherKey)) {
            newExpanded.add(otherKey);
            if (!codeSnippets.has(otherKey)) {
              fetchCodeSnippet(
                otherClass.file,
                otherMethod.startLine || otherMethod.line || 1,
                otherMethod.endLine || otherMethod.line || 1,
                otherSdkName,
                otherKey
              );
            }
          }
        }
      }
    } else {
      newExpanded.delete(key);

      // Also collapse the corresponding method on the other side
      const otherSdkName = sdkName === "ts" ? "python" : "ts";
      const otherClass =
        otherSdkName === "ts"
          ? tsClassesMap.get(className)
          : pythonClassesMap.get(className);

      if (otherClass) {
        // Find and collapse the corresponding method
        const normalizedMethodName =
          otherSdkName === "python" ? toCamelCase(methodName) : methodName;
        const otherMethod = otherClass.methods.find((m) =>
          otherSdkName === "python"
            ? toCamelCase(m.name) === normalizedMethodName
            : m.name === normalizedMethodName
        );

        if (otherMethod) {
          const otherKey = `${otherSdkName}-${className}-${otherMethod.name}`;
          newExpanded.delete(otherKey);
        }
      }
    }

    setExpandedCodeSnippets(newExpanded);
  };

  const toggleSnippetExpansion = (key: string) => {
    setExpandedSnippets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const toggleHideCommonMethods = (classKey: string) => {
    setHideCommonMethods((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(classKey)) {
        newSet.delete(classKey);
      } else {
        newSet.add(classKey);
      }
      return newSet;
    });
  };

  const toggleSortByLength = (classKey: string) => {
    setSortByLength((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(classKey)) {
        newSet.delete(classKey);
      } else {
        newSet.add(classKey);
      }
      return newSet;
    });
  };

  const findLongestMethods = () => {
    const methodLengths: Array<{
      method: Method;
      className: string;
      sdkName: string;
      length: number;
    }> = [];

    // Check all TypeScript classes
    tsData.classes.forEach((cls) => {
      cls.methods.forEach((method) => {
        if (method.name !== "constructor") {
          const length =
            (method.endLine || method.line || 1) -
            (method.startLine || method.line || 1) +
            1;
          methodLengths.push({
            method,
            className: cls.name,
            sdkName: "ts",
            length,
          });
        }
      });
    });

    // Check all Python classes
    pythonData.classes.forEach((cls) => {
      cls.methods.forEach((method) => {
        const length =
          (method.endLine || method.line || 1) -
          (method.startLine || method.line || 1) +
          1;
        methodLengths.push({
          method,
          className: cls.name,
          sdkName: "python",
          length,
        });
      });
    });

    // Sort by length (descending) and return top 15
    return methodLengths.sort((a, b) => b.length - a.length).slice(0, 15);
  };

  const findSizeRatioMethods = () => {
    const methodRatios: Array<{
      methodName: string;
      className: string;
      pythonLength: number;
      tsLength: number;
      ratio: number;
    }> = [];

    // Create maps for quick lookup
    const tsMethods = new Map<string, { method: Method; className: string }>();
    const pythonMethods = new Map<
      string,
      { method: Method; className: string }
    >();

    // Index TypeScript methods
    tsData.classes.forEach((cls) => {
      cls.methods.forEach((method) => {
        if (method.name !== "constructor") {
          const normalizedName = method.name.toLowerCase().replace(/_/g, "");
          tsMethods.set(`${cls.name}.${normalizedName}`, {
            method,
            className: cls.name,
          });
        }
      });
    });

    // Index Python methods and find matches
    pythonData.classes.forEach((cls) => {
      cls.methods.forEach((method) => {
        const normalizedName = method.name.toLowerCase().replace(/_/g, "");
        const pythonLength =
          (method.endLine || method.line || 1) -
          (method.startLine || method.line || 1) +
          1;

        // Look for matching TypeScript method
        const tsKey = `${cls.name}.${normalizedName}`;
        const tsMethod = tsMethods.get(tsKey);

        if (tsMethod) {
          const tsLength =
            (tsMethod.method.endLine || tsMethod.method.line || 1) -
            (tsMethod.method.startLine || tsMethod.method.line || 1) +
            1;

          // Only include if Python is longer than TypeScript
          if (pythonLength > tsLength) {
            const ratio = pythonLength / tsLength;
            methodRatios.push({
              methodName: method.name,
              className: cls.name,
              pythonLength,
              tsLength,
              ratio,
            });
          }
        }
      });
    });

    // Sort by ratio (descending) and return top 15
    return methodRatios.sort((a, b) => b.ratio - a.ratio).slice(0, 15);
  };

  const findTsSizeRatioMethods = () => {
    const methodRatios: Array<{
      methodName: string;
      className: string;
      pythonLength: number;
      tsLength: number;
      ratio: number;
    }> = [];

    // Create maps for quick lookup
    const pythonMethods = new Map<
      string,
      { method: Method; className: string }
    >();

    // Index Python methods
    pythonData.classes.forEach((cls) => {
      cls.methods.forEach((method) => {
        const normalizedName = method.name.toLowerCase().replace(/_/g, "");
        pythonMethods.set(`${cls.name}.${normalizedName}`, {
          method,
          className: cls.name,
        });
      });
    });

    // Index TypeScript methods and find matches
    tsData.classes.forEach((cls) => {
      cls.methods.forEach((method) => {
        if (method.name !== "constructor") {
          const normalizedName = method.name.toLowerCase().replace(/_/g, "");
          const tsLength =
            (method.endLine || method.line || 1) -
            (method.startLine || method.line || 1) +
            1;

          // Look for matching Python method
          const pythonKey = `${cls.name}.${normalizedName}`;
          const pythonMethod = pythonMethods.get(pythonKey);

          if (pythonMethod) {
            const pythonLength =
              (pythonMethod.method.endLine || pythonMethod.method.line || 1) -
              (pythonMethod.method.startLine || pythonMethod.method.line || 1) +
              1;

            // Only include if TypeScript is longer than Python
            if (tsLength > pythonLength) {
              const ratio = tsLength / pythonLength;
              methodRatios.push({
                methodName: method.name,
                className: cls.name,
                pythonLength,
                tsLength,
                ratio,
              });
            }
          }
        }
      });
    });

    // Sort by ratio (descending) and return top 15
    return methodRatios.sort((a, b) => b.ratio - a.ratio).slice(0, 15);
  };

  const getExpandedSnippetContent = (key: string) => {
    const snippet = codeSnippets.get(key);
    if (!snippet || !snippet.fullContent) return snippet?.content || "";

    const lines = snippet.fullContent.split("\n");
    const isExpanded = expandedSnippets.has(key);

    if (isExpanded) {
      // Show 5 lines above and below
      const startLine = Math.max(0, (snippet.startLine || 1) - 6);
      const endLine = Math.min(lines.length, (snippet.endLine || 1) + 5);
      return lines.slice(startLine, endLine).join("\n");
    } else {
      // Show original snippet
      return snippet.content;
    }
  };

  const getSortedMethods = (sdkClass: Class, sdkName: string): Method[] => {
    const methods =
      sdkName === "ts"
        ? sdkClass.methods.filter((m) => m.name !== "constructor")
        : sdkClass.methods;

    // Get the corresponding class from the other SDK
    const otherSdkName = sdkName === "ts" ? "python" : "ts";
    const otherClass =
      otherSdkName === "ts"
        ? tsClassesMap.get(sdkClass.name)
        : pythonClassesMap.get(sdkClass.name);

    const classKey = `${sdkName}-${sdkClass.name}`;
    const shouldHideCommon = hideCommonMethods.has(classKey);
    const shouldSortByLength = sortByLength.has(classKey);

    if (!otherClass) {
      // If no corresponding class, just sort by preference
      if (shouldSortByLength) {
        return methods.sort((a, b) => {
          const lengthA =
            (a.endLine || a.line || 1) - (a.startLine || a.line || 1) + 1;
          const lengthB =
            (b.endLine || b.line || 1) - (b.startLine || b.line || 1) + 1;
          return lengthB - lengthA; // Descending by length
        });
      }
      return methods.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Separate shared and non-shared methods
    const sharedMethods: Method[] = [];
    const nonSharedMethods: Method[] = [];

    methods.forEach((method) => {
      const normalizedMethodName =
        sdkName === "python" ? toCamelCase(method.name) : method.name;
      const otherMethodNames = otherClass.methods.map((m) =>
        otherSdkName === "python" ? toCamelCase(m.name) : m.name
      );

      if (otherMethodNames.includes(normalizedMethodName)) {
        sharedMethods.push(method);
      } else {
        nonSharedMethods.push(method);
      }
    });

    // Apply filtering and sorting
    let filteredMethods: Method[];

    if (shouldHideCommon) {
      // Only show non-shared methods
      filteredMethods = [...nonSharedMethods];
    } else {
      // Show all methods
      filteredMethods = [...sharedMethods, ...nonSharedMethods];
    }

    // Apply sorting
    if (shouldSortByLength) {
      filteredMethods.sort((a, b) => {
        const lengthA =
          (a.endLine || a.line || 1) - (a.startLine || a.line || 1) + 1;
        const lengthB =
          (b.endLine || b.line || 1) - (b.startLine || b.line || 1) + 1;
        return lengthB - lengthA; // Descending by length
      });
    } else {
      // Alphabetical sorting
      if (shouldHideCommon) {
        // Only non-shared methods, sort alphabetically
        filteredMethods.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // Shared methods first, then non-shared, both alphabetically sorted
        const sharedFiltered = [...sharedMethods];
        const nonSharedFiltered = [...nonSharedMethods];

        sharedFiltered.sort((a, b) => a.name.localeCompare(b.name));
        nonSharedFiltered.sort((a, b) => a.name.localeCompare(b.name));

        filteredMethods = [...sharedFiltered, ...nonSharedFiltered];
      }
    }

    return filteredMethods;
  };

  const getNormalizedMethodName = (
    methodName: string,
    sdkName: string
  ): string => {
    return sdkName === "python" ? toCamelCase(methodName) : methodName;
  };

  const getMethodComparisonStatus = (
    methodName: string,
    tsClass: Class | undefined,
    pythonClass: Class | undefined,
    currentSdkName: string
  ) => {
    if (!tsClass || !pythonClass) {
      return "missing";
    }

    const tsMethodNames = tsClass.methods
      .filter((m) => m.name !== "constructor")
      .map((m) => m.name);
    const pythonMethodNames = pythonClass.methods.map((m) => m.name);

    const pythonMethodNamesCamelCase = pythonMethodNames.map(toCamelCase);

    const normalizedCurrentMethod =
      currentSdkName === "python" ? toCamelCase(methodName) : methodName;

    const tsHasMethod = tsMethodNames.includes(normalizedCurrentMethod);
    const pythonHasMethod = pythonMethodNamesCamelCase.includes(
      normalizedCurrentMethod
    );

    if (tsHasMethod && pythonHasMethod) {
      return "both";
    } else if (tsHasMethod && !pythonHasMethod) {
      return "ts-only";
    } else if (!tsHasMethod && pythonHasMethod) {
      return "python-only";
    } else {
      return "missing";
    }
  };

  const renderMethodIcon = (
    methodName: string,
    tsClass: Class | undefined,
    pythonClass: Class | undefined,
    sdkName: string
  ) => {
    const status = getMethodComparisonStatus(
      methodName,
      tsClass,
      pythonClass,
      sdkName
    );

    switch (status) {
      case "both":
        return (
          <svg
            className="w-3 h-3 text-green-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "ts-only":
        return (
          <svg
            className="w-3 h-3 text-blue-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "python-only":
        return <span className="text-lg">🐍</span>;
      default:
        return (
          <svg
            className="w-3 h-3 text-gray-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  const getMethodTooltip = (
    methodName: string,
    tsClass: Class | undefined,
    pythonClass: Class | undefined,
    sdkName: string
  ) => {
    const status = getMethodComparisonStatus(
      methodName,
      tsClass,
      pythonClass,
      sdkName
    );

    switch (status) {
      case "both":
        return `Implemented in both SDKs\nTS: ${tsClass?.file}\nPython: ${pythonClass?.file}`;
      case "ts-only":
        return `Only in TypeScript SDK\nFile: ${tsClass?.file}`;
      case "python-only":
        return `Only in Python SDK\nFile: ${pythonClass?.file}`;
      default:
        return `Not found in either SDK`;
    }
  };

  const getClassTooltip = (
    className: string,
    tsClass: Class | undefined,
    pythonClass: Class | undefined
  ) => {
    if (!tsClass || !pythonClass) {
      if (tsClass) {
        return `TypeScript only\nFile: ${tsClass.file}`;
      } else if (pythonClass) {
        return `Python only\nFile: ${pythonClass.file}`;
      }
      return "Missing in both SDKs";
    }

    const tsMethodCount = tsClass.methods.filter(
      (m) => m.name !== "constructor"
    ).length;
    const pythonMethodCount = pythonClass.methods.length;

    if (tsMethodCount === pythonMethodCount) {
      return `Same method count (${tsMethodCount})\nTS: ${tsClass.file}\nPython: ${pythonClass.file}`;
    } else if (tsMethodCount > pythonMethodCount) {
      return `TypeScript has ${
        tsMethodCount - pythonMethodCount
      } more methods\nTS: ${tsClass.file}\nPython: ${pythonClass.file}`;
    } else {
      return `Python has ${
        pythonMethodCount - tsMethodCount
      } more methods\nTS: ${tsClass.file}\nPython: ${pythonClass.file}`;
    }
  };

  // Render a class card
  const renderClassCard = (
    className: string,
    sdkClass: Class | undefined,
    sdkName: string,
    isLeft: boolean
  ) => {
    const isExpanded = expandedClasses.has(className);
    const tsClass = tsClassesMap.get(className);
    const pythonClass = pythonClassesMap.get(className);

    // Determine comparison status
    const getComparisonIcon = () => {
      if (!tsClass || !pythonClass) {
        return (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"
              clipRule="evenodd"
            />
          </svg>
        );
      }

      const tsMethodCount = tsClass.methods.filter(
        (m) => m.name !== "constructor"
      ).length;
      const pythonMethodCount = pythonClass.methods.length;

      if (tsMethodCount === pythonMethodCount) {
        return (
          <svg
            className="w-4 h-4 text-green-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      } else if (tsMethodCount > pythonMethodCount) {
        return (
          <svg
            className="w-4 h-4 text-blue-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      } else {
        return <span className="text-lg">🐍</span>;
      }
    };

    const getComparisonTooltip = () => {
      if (!tsClass || !pythonClass) {
        return "Missing in one SDK";
      }

      const tsMethodCount = tsClass.methods.filter(
        (m) => m.name !== "constructor"
      ).length;
      const pythonMethodCount = pythonClass.methods.length;

      if (tsMethodCount === pythonMethodCount) {
        return `Same method count (${tsMethodCount})`;
      } else if (tsMethodCount > pythonMethodCount) {
        return `TypeScript has ${
          tsMethodCount - pythonMethodCount
        } more methods`;
      } else {
        return `Python has ${pythonMethodCount - tsMethodCount} more methods`;
      }
    };

    if (sdkClass) {
      return (
        <div className="mb-2" key={`${sdkName}-${className}`}>
          <div
            className={`border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] ${
              hoveredClass === className ? "bg-gray-200" : ""
            }`}
          >
            <div
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 hover:bg-[#C0C0C0] min-h-[60px] gap-1 sm:gap-0"
              onMouseEnter={() => setHoveredClass(className)}
              onMouseLeave={() => setHoveredClass(null)}
            >
              <div className="flex items-center space-x-2 flex-1">
                <h3
                  className="text-sm font-semibold text-black"
                  style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                >
                  {sdkClass.name}
                </h3>
                <div className="flex items-center space-x-1">
                  {getComparisonIcon()}
                </div>
              </div>
              <div className="flex flex-row sm:flex-row items-start space-y-1 sm:space-y-0 sm:space-x-1 w-full sm:w-auto">
                <span className="text-xs text-gray-500">
                  {sdkName === "ts"
                    ? `${
                        sdkClass.methods.filter((m) => m.name !== "constructor")
                          .length
                      } methods`
                    : `${sdkClass.methods.length} methods`}
                </span>
                <div className="flex flex-col items-end space-y-0.5">
                  <div className="flex items-center space-x-1">
                    <a
                      href={`https://github.com/drift-labs/${
                        sdkName === "ts" ? "protocol-v2" : "driftpy"
                      }/tree/master/${
                        sdkName === "ts" ? "sdk/src" : "src/driftpy"
                      }/${getCleanFilePath(sdkClass.file, sdkName)}#L${
                        sdkClass.startLine || sdkClass.line || 1
                      }`}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      title={`Open ${sdkClass.file} at line ${
                        sdkClass.startLine || sdkClass.line || 1
                      }`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {sdkClass.file}
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleClass(className);
                      }}
                      className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-2 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
                      title="Expand/Collapse class"
                      style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>
                  <span className="text-xs text-gray-500">
                    Line {sdkClass.startLine || sdkClass.line || 1}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            {isExpanded && (
              <div className="px-2 pb-2 space-y-0.5">
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHideCommonMethods(`${sdkName}-${className}`);
                    }}
                    className={`border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-2 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF] ${
                      hideCommonMethods.has(`${sdkName}-${className}`)
                        ? "bg-[#D0D0D0]"
                        : "bg-[#C0C0C0]"
                    }`}
                    style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                  >
                    {hideCommonMethods.has(`${sdkName}-${className}`)
                      ? "Show Common"
                      : "Hide Common"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSortByLength(`${sdkName}-${className}`);
                    }}
                    className={`border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-2 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF] ${
                      sortByLength.has(`${sdkName}-${className}`)
                        ? "bg-[#D0D0D0]"
                        : "bg-[#C0C0C0]"
                    }`}
                    style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                  >
                    {sortByLength.has(`${sdkName}-${className}`)
                      ? "Sort A-Z"
                      : "Sort by Length"}
                  </button>
                </div>
                {getSortedMethods(sdkClass, sdkName).map((method) => {
                  const tsClass = tsClassesMap.get(className);
                  const pythonClass = pythonClassesMap.get(className);
                  const normalizedMethodName = getNormalizedMethodName(
                    method.name,
                    sdkName
                  );

                  return (
                    <div key={method.name}>
                      <div
                        className="method-item flex items-center space-x-2 text-sm px-2 py-1 rounded cursor-pointer text-gray-700"
                        data-method-name={normalizedMethodName}
                        onMouseEnter={(e) => {
                          // Add highlighted class to all methods with the same name
                          const methodName = e.currentTarget.dataset.methodName;
                          document
                            .querySelectorAll(
                              `[data-method-name="${methodName}"]`
                            )
                            .forEach((el) => {
                              el.classList.add("highlighted");
                            });
                        }}
                        onMouseLeave={(e) => {
                          // Remove highlighted class from all methods with the same name
                          const methodName = e.currentTarget.dataset.methodName;
                          document
                            .querySelectorAll(
                              `[data-method-name="${methodName}"]`
                            )
                            .forEach((el) => {
                              el.classList.remove("highlighted");
                            });
                        }}
                      >
                        <div className="flex items-center space-x-1">
                          {renderMethodIcon(
                            method.name,
                            tsClass,
                            pythonClass,
                            sdkName
                          )}
                        </div>
                        <span className="flex-1">
                          {method.name}
                          {method.startLine && method.endLine && (
                            <span className="text-gray-500 ml-1">
                              ({method.endLine - method.startLine + 1} lines)
                            </span>
                          )}
                        </span>
                        <div className="flex flex-col items-end space-y-0.5">
                          <div className="flex items-center space-x-1">
                            <a
                              href={`https://github.com/drift-labs/${
                                sdkName === "ts" ? "protocol-v2" : "driftpy"
                              }/tree/master/${
                                sdkName === "ts" ? "sdk/src" : "src/driftpy"
                              }/${getCleanFilePath(sdkClass.file, sdkName)}#L${
                                method.startLine || method.line || 1
                              }`}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Open ${sdkClass.file} at line ${
                                method.startLine || method.line || 1
                              }`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {sdkClass.file}
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const key = `${sdkName}-${className}-${method.name}`;
                                toggleCodeSnippet(
                                  key,
                                  sdkClass.file,
                                  method.startLine || method.line || 1,
                                  method.endLine || method.line || 1,
                                  sdkName,
                                  className,
                                  method.name
                                );
                              }}
                              className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-2 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
                              title="Show code snippet"
                              style={{
                                fontFamily: "MS Sans Serif, sans-serif",
                              }}
                            >
                              {loadingSnippets.has(
                                `${sdkName}-${className}-${method.name}`
                              )
                                ? "..."
                                : "View"}
                            </button>
                          </div>
                          <span className="text-xs text-gray-500">
                            Line {method.startLine || method.line || 1}
                          </span>
                        </div>
                      </div>

                      {expandedCodeSnippets.has(
                        `${sdkName}-${className}-${method.name}`
                      ) && (
                        <div className="ml-4 mb-2">
                          {loadingSnippets.has(
                            `${sdkName}-${className}-${method.name}`
                          ) ? (
                            <div className="text-sm text-gray-500 py-2">
                              Loading code snippet...
                            </div>
                          ) : codeSnippets.has(
                              `${sdkName}-${className}-${method.name}`
                            ) ? (
                            <div className="mt-1">
                              <pre className="bg-black p-2 rounded text-xs overflow-x-auto border">
                                <code
                                  className={`language-${
                                    codeSnippets.get(
                                      `${sdkName}-${className}-${method.name}`
                                    )?.language
                                  }`}
                                  dangerouslySetInnerHTML={{
                                    __html: highlightCode(
                                      getExpandedSnippetContent(
                                        `${sdkName}-${className}-${method.name}`
                                      ),
                                      codeSnippets.get(
                                        `${sdkName}-${className}-${method.name}`
                                      )?.language || ""
                                    ),
                                  }}
                                />
                              </pre>
                              <div className="flex justify-center mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSnippetExpansion(
                                      `${sdkName}-${className}-${method.name}`
                                    );
                                  }}
                                  className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-2 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
                                  style={{
                                    fontFamily: "MS Sans Serif, sans-serif",
                                  }}
                                >
                                  {expandedSnippets.has(
                                    `${sdkName}-${className}-${method.name}`
                                  )
                                    ? "Show fewer lines"
                                    : "Show more lines"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
                {sdkName === "ts" &&
                  sdkClass.methods.some((m) => m.name === "constructor") && (
                    <div className="flex items-center space-x-2 text-sm text-gray-400 italic px-2 py-1 rounded">
                      <div className="flex items-center space-x-1">
                        <svg
                          className="w-3 h-3 text-gray-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <span>constructor (ignored)</span>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div className="mb-2" key={`${sdkName}-${className}`}>
          <div
            className={`border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] h-[60px] flex flex-col ${
              hoveredClass === className ? "bg-gray-200" : ""
            }`}
          >
            <div
              className="p-2 flex-1 flex flex-col justify-center"
              onMouseEnter={() => setHoveredClass(className)}
              onMouseLeave={() => setHoveredClass(null)}
            >
              <div className="flex items-center space-x-2">
                <h3
                  className="text-sm font-semibold text-gray-600"
                  style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                >
                  {className}
                </h3>
                <div className="flex items-center space-x-1">
                  {getComparisonIcon()}
                </div>
              </div>
              <div className="text-sm text-gray-400 italic">
                Not implemented in {sdkName === "ts" ? "TypeScript" : "Python"}
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div
      className="min-h-screen bg-[#C0C0C0] flex flex-col"
      style={{ fontFamily: "MS Sans Serif, sans-serif" }}
    >
      <style>{`
        .method-item {
          transition: background-color 0.1s ease, color 0.1s ease;
        }

        .method-item:hover {
          background-color: #e5e7eb !important;
          color: #374151 !important;
        }

        .method-item.highlighted {
          background-color: #e5e7eb !important;
          color: #374151 !important;
        }
      `}</style>
      <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center">
            <div className="flex-1 text-center">
              <div className="relative h-[200px] sm:h-[250px] lg:h-[300px] w-full overflow-hidden">
                <HyperText
                  className="text-2xl sm:text-3xl lg:text-4xl font-bold text-black"
                  style={{ fontFamily: "'Press Start 2P', monospace" }}
                >
                  are we driftpy yet?
                </HyperText>
                <ComicText fontSize={2} className="sm:hidden">
                  probably not!
                </ComicText>
                <ComicText fontSize={2} className="hidden sm:block">
                  probably not!
                </ComicText>
                <RetroGrid
                  lightLineColor="#000000"
                  darkLineColor="#000000"
                ></RetroGrid>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
                  <div className="lg:hidden text-xs text-red-600 font-bold mb-2">
                    MOBILE VIEW
                  </div>
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      window.open(
                        "https://github.com/drift-labs/protocol-v2/tree/master/sdk/src",
                        "_blank"
                      );
                    }}
                  >
                    <Tilt>
                      <img
                        src="/typescript.png"
                        className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48"
                      />
                    </Tilt>
                  </div>
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      window.open(
                        "https://github.com/drift-labs/driftpy/tree/master/src/driftpy",
                        "_blank"
                      );
                    }}
                  >
                    <Tilt>
                      <img
                        src="/python.png"
                        className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48"
                      />
                    </Tilt>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="relative mb-2">
          <input
            type="text"
            placeholder="Search classes and methods..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-2 py-1 bg-white border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] text-black text-sm"
            style={{ fontFamily: "MS Sans Serif, sans-serif" }}
          />
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
            <svg
              className="h-4 w-4 text-black"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-2 items-start sm:items-center mb-2">
          <span className="text-xs font-medium text-black">Show:</span>
          <label className="flex items-center space-x-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showCommon}
              onChange={(e) => setShowCommon(e.target.checked)}
              className="w-3 h-3 border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] bg-white"
            />
            <span className="text-xs text-black">
              Common classes (both SDKs)
            </span>
          </label>
          <label className="flex items-center space-x-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showTsOnly}
              onChange={(e) => setShowTsOnly(e.target.checked)}
              className="w-3 h-3 border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] bg-white"
            />
            <span className="text-xs text-black">TypeScript only</span>
          </label>
          <label className="flex items-center space-x-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showPythonOnly}
              onChange={(e) => setShowPythonOnly(e.target.checked)}
              className="w-3 h-3 border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] bg-white"
            />
            <span className="text-xs text-black">Python only</span>
          </label>
          <label className="flex items-center space-x-1 cursor-pointer">
            <input
              type="checkbox"
              checked={hideEmptyClasses}
              onChange={(e) => setHideEmptyClasses(e.target.checked)}
              className="w-3 h-3 border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] bg-white"
            />
            <span className="text-xs text-black">Hide empty classes</span>
          </label>
        </div>

        <div className="flex justify-center mb-2 gap-2">
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-3 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
            style={{ fontFamily: "MS Sans Serif, sans-serif" }}
          >
            🏆 Longest Methods
          </button>
          <button
            onClick={() => setShowRatioLeaderboard(!showRatioLeaderboard)}
            className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-3 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
            style={{ fontFamily: "MS Sans Serif, sans-serif" }}
          >
            📊 Python &gt; TS
          </button>
          <button
            onClick={() => setShowTsRatioLeaderboard(!showTsRatioLeaderboard)}
            className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-3 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
            style={{ fontFamily: "MS Sans Serif, sans-serif" }}
          >
            📊 TS &gt; Python
          </button>
        </div>

        {showLeaderboard && (
          <div className="mb-4 bg-white border-2 border-gray-400 shadow-lg">
            <div className="bg-[#C0C0C0] border-b border-gray-400 p-2">
              <h3
                className="text-sm font-bold text-black"
                style={{ fontFamily: "MS Sans Serif, sans-serif" }}
              >
                🏆 Top 15 Longest Methods
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#E0E0E0] border-b border-gray-300">
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Rank
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Method
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Class
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      SDK
                    </th>
                    <th className="px-2 py-1 text-left font-bold">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {findLongestMethods().map((item, index) => (
                    <tr
                      key={`${item.sdkName}-${item.className}-${item.method.name}`}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <td className="border-r border-gray-300 px-2 py-1 font-bold text-center">
                        {index === 0
                          ? "🥇"
                          : index === 1
                          ? "🥈"
                          : index === 2
                          ? "🥉"
                          : `#${index + 1}`}
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1 font-mono text-xs">
                        {item.method.name}
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1">
                        <button
                          onClick={() => setSearchTerm(item.className)}
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {item.className}
                        </button>
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1">
                        <span className="text-2xs">
                          {item.sdkName === "ts"
                            ? "💻 TypeScript"
                            : "🐍 Python"}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-bold text-center">
                        {item.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showRatioLeaderboard && (
          <div className="mb-4 bg-white border-2 border-gray-400 shadow-lg">
            <div className="bg-[#C0C0C0] border-b border-gray-400 p-2">
              <h3
                className="text-sm font-bold text-black"
                style={{ fontFamily: "MS Sans Serif, sans-serif" }}
              >
                📊 Python vs TypeScript Size Ratio (Top 15)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#E0E0E0] border-b border-gray-300">
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Rank
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Method
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Class
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      🐍 Python Lines
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      💻 TS Lines
                    </th>
                    <th className="px-2 py-1 text-left font-bold">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {findSizeRatioMethods().map((item, index) => (
                    <tr
                      key={`${item.className}-${item.methodName}`}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <td className="border-r border-gray-300 px-2 py-1 font-bold text-center">
                        {index === 0
                          ? "🥇"
                          : index === 1
                          ? "🥈"
                          : index === 2
                          ? "🥉"
                          : `#${index + 1}`}
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1 font-mono text-xs">
                        {item.methodName}
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1">
                        <button
                          onClick={() => setSearchTerm(item.className)}
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {item.className}
                        </button>
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1 font-bold text-center text-green-700">
                        {item.pythonLength}
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1 font-bold text-center text-blue-700">
                        {item.tsLength}
                      </td>
                      <td className="px-2 py-1 font-bold text-center">
                        <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">
                          {item.ratio.toFixed(1)}x
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showTsRatioLeaderboard && (
          <div className="mb-4 bg-white border-2 border-gray-400 shadow-lg">
            <div className="bg-[#C0C0C0] border-b border-gray-400 p-2">
              <h3
                className="text-sm font-bold text-black"
                style={{ fontFamily: "MS Sans Serif, sans-serif" }}
              >
                📊 TypeScript vs Python Size Ratio (Top 15)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#E0E0E0] border-b border-gray-300">
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Rank
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Method
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      Class
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      💻 TS Lines
                    </th>
                    <th className="border-r border-gray-300 px-2 py-1 text-left font-bold">
                      🐍 Python Lines
                    </th>
                    <th className="px-2 py-1 text-left font-bold">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {findTsSizeRatioMethods().map((item, index) => (
                    <tr
                      key={`${item.className}-${item.methodName}`}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <td className="border-r border-gray-300 px-2 py-1 font-bold text-center">
                        {index === 0
                          ? "🥇"
                          : index === 1
                          ? "🥈"
                          : index === 2
                          ? "🥉"
                          : `#${index + 1}`}
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1 font-mono text-xs">
                        {item.methodName}
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1">
                        <button
                          onClick={() => setSearchTerm(item.className)}
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {item.className}
                        </button>
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1 font-bold text-center text-blue-700">
                        {item.tsLength}
                      </td>
                      <td className="border-r border-gray-300 px-2 py-1 font-bold text-center text-green-700">
                        {item.pythonLength}
                      </td>
                      <td className="px-2 py-1 font-bold text-center">
                        <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">
                          {item.ratio.toFixed(1)}x
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-2 items-start sm:items-center text-xs text-gray-600">
          <span className="font-medium">Legend:</span>
          <div className="flex items-center space-x-1">
            <svg
              className="w-3 h-3 text-green-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Same method count / Implemented in both</span>
          </div>
          <div className="flex items-center space-x-1">
            <svg
              className="w-3 h-3 text-blue-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>TypeScript has more / Only in TS</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-lg">🐍</span>
            <span>Python has more / Only in Python</span>
          </div>
          <div className="flex items-center space-x-1">
            <svg
              className="w-3 h-3 text-gray-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>Missing in one SDK</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-center justify-center">
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-2">
            <h3 className="text-sm font-semibold text-black">TypeScript SDK</h3>
            <p className="text-black text-xs">
              {tsData.classes.length} classes
            </p>
          </div>
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-2">
            <h3 className="text-sm font-semibold text-black">Python SDK</h3>
            <p className="text-black text-xs">
              {pythonData.classes.length} classes
            </p>
          </div>
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-2">
            <h3 className="text-sm font-semibold text-black">TS w/ Methods</h3>
            <p className="text-black text-xs">
              {
                tsData.classes.filter(
                  (cls) =>
                    cls.methods.filter((m) => m.name !== "constructor").length >
                    0
                ).length
              }{" "}
              classes
            </p>
          </div>
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-2">
            <h3 className="text-sm font-semibold text-black">
              Python w/ Methods
            </h3>
            <p className="text-black text-xs">
              {
                pythonData.classes.filter((cls) => cls.methods.length > 0)
                  .length
              }{" "}
              classes
            </p>
          </div>
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-2">
            <h3 className="text-sm font-semibold text-black">Common Classes</h3>
            <p className="text-black text-xs">
              {
                sortedClassNames.filter(
                  (name) => tsClassesMap.has(name) && pythonClassesMap.has(name)
                ).length
              }{" "}
              classes
            </p>
          </div>
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-2">
            <h3 className="text-sm font-semibold text-black">Unique Classes</h3>
            <p className="text-black text-xs">
              {
                sortedClassNames.filter(
                  (name) =>
                    !tsClassesMap.has(name) || !pythonClassesMap.has(name)
                ).length
              }{" "}
              classes
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row">
        <div className="flex-1 bg-[#C0C0C0] border-r-0 lg:border-r-2 border-r-[#808080] border-b-2 lg:border-b-0 border-b-[#808080] mb-4 lg:mb-0">
          <div className="bg-[#000080] text-white px-6 py-4 sticky top-0 z-10 border-b-2 border-b-[#808080]">
            <h2
              className="text-lg font-semibold"
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: "19px",
              }}
            >
              TypeScript
            </h2>
          </div>
          <div
            className="p-2 h-full overflow-y-auto bg-[#C0C0C0]"
            ref={tsColumnRef}
            onScroll={() =>
              handleScroll(
                tsColumnRef as React.RefObject<HTMLDivElement>,
                pythonColumnRef as React.RefObject<HTMLDivElement>
              )
            }
          >
            {filteredClassNames.map((className, index) => (
              <div
                key={`ts-${className}`}
                className={index % 2 === 0 ? "bg-[#C0C0C0]" : "bg-[#D0D0D0]"}
              >
                {renderClassCard(
                  className,
                  tsClassesMap.get(className),
                  "ts",
                  true
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-[#C0C0C0]">
          <div className="bg-[#008000] text-white px-6 py-4 sticky top-0 z-10 border-b-2 border-b-[#808080]">
            <h2
              className="text-lg font-semibold"
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: "19px",
              }}
            >
              Python SDK
            </h2>
          </div>
          <div
            className="p-2 h-full overflow-y-auto bg-[#C0C0C0]"
            ref={pythonColumnRef}
            onScroll={() =>
              handleScroll(
                pythonColumnRef as React.RefObject<HTMLDivElement>,
                tsColumnRef as React.RefObject<HTMLDivElement>
              )
            }
          >
            {filteredClassNames.map((className, index) => (
              <div
                key={`python-${className}`}
                className={index % 2 === 0 ? "bg-[#C0C0C0]" : "bg-[#D0D0D0]"}
              >
                {renderClassCard(
                  className,
                  pythonClassesMap.get(className),
                  "python",
                  false
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
