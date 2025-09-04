const Task = require("../models/Task");

// @desc Get all tasks (Admin: all, user : only assigned tasks)
// @route GET /api/tasks/
// @access Private
const getTasks = async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};

    // Case-insensitive filter for status
    if (status && status.toLowerCase() !== "all") {
      filter.status = new RegExp(`^${status}$`, "i");
    }

    let tasks;

    if (req.user.role === "admin") {
      tasks = await Task.find(filter).populate(
        "assignedTo",
        "name email profileImageUrl"
      );
    } else {
      tasks = await Task.find({ ...filter, assignedTo: req.user._id }).populate(
        "assignedTo",
        "name email profileImageUrl"
      );
    }

    // Add completed todoChecklist count to each task
    tasks = await Promise.all(
      tasks.map(async (task) => {
        const completedCount = task.todoChecklist.filter(
          (item) => item.completed
        ).length;
        return { ...task._doc, completedTodoCount: completedCount };
      })
    );

    // Base filter depending on role
    const baseFilter = req.user.role === "admin" ? {} : { assignedTo: req.user._id };

    // Status summary counts (case-insensitive)
    const allTasks = await Task.countDocuments(baseFilter);

    const pendingTasks = await Task.countDocuments({
      ...baseFilter,
      status: { $regex: /^Pending$/i },
    });

    const inProgressTasks = await Task.countDocuments({
      ...baseFilter,
      status: { $regex: /^In Progress$/i },
    });

    const completedTasks = await Task.countDocuments({
      ...baseFilter,
      status: { $regex: /^Completed$/i },
    });

    res.json({
      tasks,
      statusSummary: {
        all: allTasks,
        pendingTasks,
        inProgressTasks,
        completedTasks,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// @desc Get task by ID
// @route GET /api/tasks/:id
// @access Private
const getTaskById = async (req, res) => {
    try{
        const task = await Task.findById(req.params.id).populate(
            "assignedTo",
            "name email profileImageUrl",
        );

        if (!task) return res.status(404).json({ message: "Task not found" });

        res.json(task);
    } catch (error){
        res.status(500).json({ message: "Server error", error: error.message});
    }
}

// @desc Create a new task (Admin Only)
// @route POSt /api/tasks/
// @access Private
const createTask = async (req, res) => {
    try{
        const {
            title,
            description,
            priority, 
            dueDate,
            assignedTo,
            attachments,
            todoChecklist
        } = req.body

        if (!Array.isArray(assignedTo)){
            return res
            .status(400)
            .json({ message: "assignedTo must be an array of user IDs" });
        }

        const task = await Task.create({
            title,
            description,
            priority,
            dueDate,
            assignedTo,
            createdBy: req.user_id,
            todoChecklist,
            attachments
        });

        res.status(201).json({ message: "Task created successfully", task });
    } catch (error){
        res.status(500).json({ message: "Server error", error: error.message});
    }
};

// @desc Update task details
// @route PUT /api/tasks/:id
// @access Private
const updatedTask = async (req, res) => {
    try{
        const task = await Task.findById(req.params.id);

        if (!task) return res.status(404).json({ message: "Task not found" });

        task.title = req.body.title || task.title;
        task.description = req.body.description || task.description;
        task.priority = req.body.priority || task.priority;
        task.dueDate = req.body.dueDate || task.dueDate;
        task.todoChecklist = req.body.todoChecklist || task.todoChecklist;
        task.attachments = req.body.attachments || task.attachments;

        if (req.body.assignedTo) {
            if(!Array.isArray(req.body.assignedTo)) {
                return res
                    .status(400)
                    .json({ message: "assignedTo mus be an array of user ID" });
            }
            task.assignedTo = req.body.assignedTo;
        }

        const updatedTask = await task.save();
        res.json({ message: "Task Updated Successfully", updatedTask});

    } catch (error){
        res.status(500).json({ message: "Server error", error: error.message});
    }
};

// @desc Delete task details
// @route DELETE /api/tasks/:id
// @access Private
const deleteTask = async (req, res) => {
    try{
        const task = await Task.findById(req.params.id);

        if (!task) return res.status(404).json({ message: "Task not found" });

        await task.deleteOne();
        res.json({ message: "Task deleted successfully" });
    } catch (error){
        res.status(500).json({ message: "Server error", error: error.message});
    }
}

// @desc Update task status
// @route PUT /api/tasks/:id/status
// @access Private
const updateTaskStatus = async (req, res) => {
    try{
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        const isAssigned = task.assignedTo.some(
            (userId) => userId.toString() === req.user._id.toString()
        );

        if(!isAssigned && req.user.role !== "admin"){
            return res.status(403).json({ message: "Not authorized" })
        }

        task.status = req.body.status || task.status;

        if (task.status === "Completed") {
            task.todoChecklist.forEach((item) => (item.completed = true));
            task.progress = 100;
        }

        await task.save();
        res.json({ message: "Task Status Updated", task });

    } catch (error){
        res.status(500).json({ message: "Server error", error: error.message});
    }
}

// @desc Update task checklist
// @route PUT /api/tasks/:id/todo
// @access Private
const updateTaskChecklist = async (req, res) => {
    try{
        const { todoChecklist } = req.body;
        const task = await Task.findById(req.params.id);

        if(!task) return res.status(404).json({ message: "Task not found" });

        if(!task.assignedTo.includes(req.user._id) && req.user.role !== "admin"){
            return res.status(403).json({ message: "Not authorized to update checklist" });
        }

        task.todoChecklist = todoChecklist; // Replace with update Checklist 

        // Auto-update progress based on checklist completion
        const completedCount = task.todoChecklist.filter((item) => item.completed).length;

        const totalItems = task.todoChecklist.length;
        task.progress = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

        // Auto-mark task as completed if all items are checked
        if (task.progress === 100){
            task.status = "Completed";
        } else if (task.progress > 0){
            task.status = "In Progress";
        } else{
            task.status = "Pending";
        }

        await task.save();
        const updatedTask = await Task.findById(req.params.id).populate(
            "assignedTo",
            "name email profileImageUrl"
        );

        res.json({ message: "Task Checklist updated", task:updatedTask });
    } catch (error){
        res.status(500).json({ message: "Server error", error: error.message});
    }
}

// @desc Dashboard Data (Admin only)
// @route GET /api/task/dashboard-data
// @access Private
const getDashboardData = async (req, res) => {
    try {
        // Stats
        const totalTasks = await Task.countDocuments();
        const pendingTasks = await Task.countDocuments({ status: "Pending" });
        const completedTasks = await Task.countDocuments({ status: "Completed" });
        const overdueTasks = await Task.countDocuments({
            status: { $ne: "Completed" },
            dueDate: { $lt: new Date() },
        });

        // Task distribution by status
        const taskStatuses = ["Pending", "In Progress", "Completed"];
        const taskDistributionRaw = await Task.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                },
            },
        ]);

        const taskDistribution = taskStatuses.reduce((acc, status) => {
            const formattedKey = status.replace(/\s+/g, ""); // remove spaces
            acc[formattedKey] =
                taskDistributionRaw.find((item) => item._id === status)?.count || 0;
            return acc;
        }, {});
        taskDistribution["All"] = totalTasks;

        // Task distribution by priority
        const taskPriorities = ["Low", "Medium", "High"];
        const taskPriorityLevelsRaw = await Task.aggregate([
            {
                $group: {
                    _id: "$priority",
                    count: { $sum: 1 },
                },
            },
        ]);

        const taskPriorityLevels = taskPriorities.reduce((acc, priority) => {
            acc[priority] =
                taskPriorityLevelsRaw.find((item) => item._id === priority)?.count || 0;
            return acc;
        }, {});

        // Recent tasks
        const recentTasks = await Task.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .select("title status priority dueDate createdAt");

        res.status(200).json({
            statistics: {
                totalTasks,
                pendingTasks,
                completedTasks,
                overdueTasks,
            },
            charts: {
                taskDistribution,
                taskPriorityLevels,
            },
            recentTasks,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};


// @desc Dashboard Data (User-specific)
// @route GET /api/tasks/user-dashboard-data
// @access Private
const getUserDashboardData = async (req, res) => {
    try{
        const userId = req.user._id;

        const totalTasks = await Task.countDocuments({ assignedTo: userId});
        const pendingTasks = await Task.countDocuments({ assignesTo: userId, status: "Pending" });
        const completedTasks = await Task.countDocuments({ assignedTo: userId, status: "Completed" });

        const overdueTasks = await Task.countDocuments({ 
            assignedTo: userId,
            status : { $ne: "Completed" },
            dueDate: { $lt: new Date() },
        });

        // Task Distribution by status
        const taskStatuses = ["Pending", "In Progress", "Completed"];
        const taskDistributionRaw = await Task.aggregate([
            { $match: { assignedTo: userId } },
            { $group: { _id: "$status", count: { $sum: 1 }}},
        ]);

        const taskDistribution = taskStatuses.reduce((acc, status) => {
            const formattedKey = status.replace(/\s+/g, "");
            acc[formattedKey] = taskDistributionRaw.find((item) => item._id === status)?.count || 0;
            return acc;
        }, {});
        taskDistribution["All"] = totalTasks;

        // Task Distribution by priority
        const taskPriorities = ["Low", "Medium", "High"];
        const taskPriorityLevelsRaw = await Task.aggregate([
            { $match: {assignedTo: userId } },
            {$group: { _id: "$priority", count: { $sum: 1 } } },
        ]);

        const taskPriorityLevels = taskPriorities.reduce((acc, priority) => {
            acc [priority] =
                taskPriorityLevelsRaw.find((item) => item._id === priority)?.count || 0;
            return acc;
        }, {});

        // Fetch recent 10 tasks for the logged-in user
        const recentTasks = await Task.find({ assignedTo: userId })
            .sort({ createdAt: -1 })
            .limit (10)
            .select("title status priority dueDate createdAt");
            res.status(200).json({
            statistics: {
            totalTasks,
            pendingTasks,
            completedTasks,
            overdueTasks,
            },
            charts: {
                taskDistribution,
                taskPriorityLevels,
            },
            recentTasks,
        });
    } catch (error){
        res.status(500).json({ message: "Server error", error: error.message});
    }
}

module.exports = {
    getTasks,
    getTaskById,
    createTask,
    updatedTask,
    deleteTask,
    updateTaskStatus,
    updateTaskChecklist,
    getDashboardData,
    getUserDashboardData
}