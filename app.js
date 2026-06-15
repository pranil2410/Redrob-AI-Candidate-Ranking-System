// Redrob AI Candidate Ranking Portal — app.js

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const sliders = {
    tech: document.getElementById("w-tech"),
    exp: document.getElementById("w-exp"),
    ai: document.getElementById("w-ai"),
    ret: document.getElementById("w-ret"),
    beh: document.getElementById("w-beh"),
    loc: document.getElementById("w-loc"),
    sim: document.getElementById("w-sim")
  };
  
  const labels = {
    tech: document.getElementById("val-tech"),
    exp: document.getElementById("val-exp"),
    ai: document.getElementById("val-ai"),
    ret: document.getElementById("val-ret"),
    beh: document.getElementById("val-beh"),
    loc: document.getElementById("val-loc"),
    sim: document.getElementById("val-sim")
  };

  const resetWeightsBtn = document.getElementById("reset-weights");
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const fileInfoContainer = document.getElementById("file-info-container");
  const selectedFileName = document.getElementById("selected-file-name");
  const selectedFileSize = document.getElementById("selected-file-size");
  const processBtn = document.getElementById("process-btn");
  
  const statPool = document.getElementById("stat-pool");
  const statHoneypots = document.getElementById("stat-honeypots");
  const statValid = document.getElementById("stat-valid");
  const downloadCsvBtn = document.getElementById("download-csv-btn");
  
  const emptyStateView = document.getElementById("empty-state-view");
  const loadingStateView = document.getElementById("loading-state-view");
  const loadingHeader = loadingStateView.querySelector("h3");
  const loadingDesc = loadingStateView.querySelector("p");
  const tableView = document.getElementById("table-view");
  const rankingsTbody = document.getElementById("rankings-tbody");
  const loadSampleBtn = document.getElementById("load-sample-btn");
  
  // Modal Elements
  const detailModal = document.getElementById("detail-modal");
  const closeModalBtn = document.getElementById("close-modal");
  const modalName = document.getElementById("modal-name");
  const modalTitleCompany = document.getElementById("modal-title-company");
  const modalId = document.getElementById("modal-id");
  const modalYears = document.getElementById("modal-years");
  const modalLocation = document.getElementById("modal-location");
  const modalStatus = document.getElementById("modal-status");
  const modalBreakdown = document.getElementById("modal-breakdown");
  const modalAuditStatus = document.getElementById("modal-audit-status");

  let uploadedFile = null;
  let rankedResults = [];

  const defaultWeights = {
    tech: 35, exp: 20, ai: 15, ret: 10, beh: 10, loc: 5, sim: 5
  };

  // --- Real-time Weight Normalization ---
  function updateWeightUI() {
    const vals = {
      tech: parseFloat(sliders.tech.value),
      exp: parseFloat(sliders.exp.value),
      ai: parseFloat(sliders.ai.value),
      ret: parseFloat(sliders.ret.value),
      beh: parseFloat(sliders.beh.value),
      loc: parseFloat(sliders.loc.value),
      sim: parseFloat(sliders.sim.value)
    };

    const sum = Object.values(vals).reduce((a, b) => a + b, 0);

    if (sum > 0) {
      Object.keys(vals).forEach(key => {
        const norm = (vals[key] / sum) * 100;
        labels[key].textContent = `${Math.round(norm)}%`;
      });
    } else {
      Object.keys(vals).forEach(key => {
        labels[key].textContent = "0%";
      });
    }
  }

  // Bind slider events
  Object.values(sliders).forEach(slider => {
    slider.addEventListener("input", updateWeightUI);
  });

  resetWeightsBtn.addEventListener("click", () => {
    Object.keys(defaultWeights).forEach(key => {
      sliders[key].value = defaultWeights[key];
    });
    updateWeightUI();
  });

  // Initial update
  updateWeightUI();

  // --- File Upload Handling ---
  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  ["dragleave", "drop"].forEach(event => {
    dropZone.addEventListener(event, () => {
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  function handleFile(file) {
    uploadedFile = file;
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = formatBytes(file.size);
    fileInfoContainer.classList.remove("hidden");
    processBtn.removeAttribute("disabled");
    console.log(`File selected: ${file.name} (${file.size} bytes). Ready for ranking.`);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // --- Dynamic Demo Data Loader ---
  loadSampleBtn.addEventListener("click", () => {
    emptyStateView.classList.add("hidden");
    loadingStateView.classList.remove("hidden");
    loadingHeader.textContent = "Fetching Sample Candidates...";
    loadingDesc.textContent = "Downloading demo candidate dataset from serverless origin...";
    
    fetch("sample_candidates.json")
      .then(res => {
        if (!res.ok) throw new Error("Network issue loading sample candidates.");
        return res.blob();
      })
      .then(blob => {
        blob.name = "sample_candidates.json";
        uploadedFile = blob;
        selectedFileName.textContent = "sample_candidates.json";
        selectedFileSize.textContent = "300 KB";
        fileInfoContainer.classList.remove("hidden");
        processBtn.removeAttribute("disabled");
        
        // Auto process
        processCandidates();
      })
      .catch(err => {
        loadingStateView.classList.add("hidden");
        emptyStateView.classList.remove("hidden");
        alert("Could not load sample file automatically. Please drag and drop the file instead.");
        console.error(err);
      });
  });

  // --- Processing Pipeline (Web Worker based) ---
  processBtn.addEventListener("click", () => {
    processCandidates();
  });

  function processCandidates() {
    if (!uploadedFile) return;
    
    tableView.classList.add("hidden");
    emptyStateView.classList.add("hidden");
    loadingStateView.classList.remove("hidden");
    downloadCsvBtn.classList.add("hidden");
    
    loadingHeader.textContent = "Initializing Ranking Engine...";
    loadingDesc.textContent = "Spawning Web Worker and allocating memory buffers...";

    const weights = {
      tech_skills: parseFloat(sliders.tech.value),
      exp_relevance: parseFloat(sliders.exp.value),
      ai_ml_production: parseFloat(sliders.ai.value),
      retrieval_exp: parseFloat(sliders.ret.value),
      behavioral_signals: parseFloat(sliders.beh.value),
      location_availability: parseFloat(sliders.loc.value),
      semantic_similarity: parseFloat(sliders.sim.value)
    };

    // Instantiate background Web Worker
    const worker = new Worker("worker.js");
    
    // Send data to worker
    worker.postMessage({
      file: uploadedFile,
      weights: weights
    });

    // Handle messages from worker
    worker.onmessage = function(e) {
      const data = e.data;
      
      if (data.type === "progress") {
        const pct = Math.round((data.loaded / data.total) * 100);
        loadingHeader.textContent = `Processing Candidates: ${pct}%`;
        loadingDesc.textContent = `Streaming input pool: parsed ${data.totalPool.toLocaleString()} candidates, flagged ${data.honeypots} honeypots.`;
      } 
      else if (data.type === "status") {
        loadingDesc.textContent = data.message;
      } 
      else if (data.type === "done") {
        loadingStateView.classList.add("hidden");
        rankedResults = data.results;
        displayResults();
        worker.terminate();
      } 
      else if (data.type === "error") {
        loadingStateView.classList.add("hidden");
        emptyStateView.classList.remove("hidden");
        alert(`Error running ranking: ${data.error}`);
        worker.terminate();
      }
    };

    worker.onerror = function(err) {
      loadingStateView.classList.add("hidden");
      emptyStateView.classList.remove("hidden");
      alert("A critical Web Worker execution error occurred.");
      console.error(err);
      worker.terminate();
    };
  }

  // --- Render Results ---
  function displayResults() {
    rankingsTbody.innerHTML = "";
    
    const totalCount = rankedResults.length;
    const honeypotCount = rankedResults.filter(r => r.is_suspicious).length;
    const validCount = totalCount - honeypotCount;
    
    statPool.textContent = totalCount;
    statHoneypots.textContent = honeypotCount;
    statValid.textContent = validCount;
    
    // We display top 100 for visual preview, or all matching if less
    const displayData = rankedResults.slice(0, 100);
    
    displayData.forEach(item => {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => openModal(item));
      
      const rankVal = item.rank;
      const scoreVal = item.score.toFixed(4);
      
      let scoreStyle = "";
      if (item.is_suspicious) {
        tr.classList.add("flagged-row");
        scoreStyle = "class='text-red'";
      }
      
      tr.innerHTML = `
        <td><div class="rank-badge">${rankVal}</div></td>
        <td>
          <div class="candidate-name-col">
            <span class="candidate-name">${item.profile.name}</span>
            <span class="candidate-title">${item.profile.title} at ${item.profile.company}</span>
          </div>
        </td>
        <td><span class="score-col" ${scoreStyle}>${scoreVal}</span></td>
        <td><p class="reasoning-col">${item.reasoning}</p></td>
      `;
      
      rankingsTbody.appendChild(tr);
    });
    
    tableView.classList.remove("hidden");
    downloadCsvBtn.classList.remove("hidden");
  }

  // --- Detailed Modal Popup ---
  function openModal(item) {
    modalName.textContent = item.profile.name;
    modalTitleCompany.textContent = `${item.profile.title} at ${item.profile.company}`;
    modalId.textContent = item.candidate_id;
    modalYears.textContent = `${item.profile.years.toFixed(1)} Years`;
    modalLocation.textContent = item.profile.location;
    modalStatus.textContent = item.is_suspicious ? "Flagged/Suspicious" : "Eligible";
    
    // Score Breakdown rendering
    modalBreakdown.innerHTML = "";
    
    const categories = [
      { label: "Technical Skills", val: item.breakdown.tech_skills },
      { label: "Experience Relevance", val: item.breakdown.exp_relevance },
      { label: "AI/ML Production", val: item.breakdown.ai_ml_production },
      { label: "Retrieval/Search", val: item.breakdown.retrieval_exp },
      { label: "Behavioral Signals", val: item.breakdown.behavioral_signals },
      { label: "Location Fit", val: item.breakdown.location_availability },
      { label: "Semantic Similarity", val: item.breakdown.semantic_similarity }
    ];
    
    categories.forEach(cat => {
      const pct = Math.round(cat.val * 100);
      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.innerHTML = `
        <div class="breakdown-info">
          <span>${cat.label}</span>
          <span>${pct}%</span>
        </div>
        <div class="breakdown-progress-container">
          <div class="breakdown-progress-bar" style="width: ${pct}%"></div>
        </div>
      `;
      modalBreakdown.appendChild(row);
    });
    
    // Audit Status
    if (item.is_suspicious) {
      modalAuditStatus.className = "audit-status audit-flagged";
      modalAuditStatus.textContent = "⚠️ FLAGGED PROFILE: Our automated timeline integrity check detected impossible career durations, overlapping timelines, or contradictory skill records. A penalty factor was applied.";
    } else {
      modalAuditStatus.className = "audit-status audit-clean";
      modalAuditStatus.textContent = "✅ VERIFIED: All timeline checks, company history audits, and promotion timelines are logically consistent. Profile is cleared for placement.";
    }
    
    detailModal.classList.remove("hidden");
  }

  closeModalBtn.addEventListener("click", () => {
    detailModal.classList.add("hidden");
  });

  // Close modal when clicking backdrop
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) {
      detailModal.classList.add("hidden");
    }
  });

  // --- Export CSV Client-Side ---
  downloadCsvBtn.addEventListener("click", () => {
    if (rankedResults.length === 0) return;
    
    // Grab only the top 100
    const exportData = rankedResults.slice(0, 100);
    
    let csvContent = "candidate_id,rank,score,reasoning\r\n";
    
    exportData.forEach(item => {
      const escapedReasoning = item.reasoning.replace(/"/g, '""');
      const row = [
        item.candidate_id,
        item.rank,
        item.score.toFixed(4),
        `"${escapedReasoning}"`
      ];
      csvContent += row.join(",") + "\r\n";
    });
    
    // UTF-8 export with BOM for Excel compatibility
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "final_submission.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
});
