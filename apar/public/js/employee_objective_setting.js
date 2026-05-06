

frappe.ui.form.on('Employee Objective Setting', {

    // --------------------------------------------------
    // ONLOAD
    // --------------------------------------------------
    onload: function (frm) {

        // Check objective setting window ONLY for Draft + Employee
        if (
            frappe.user.has_role("Employee") &&
            frm.doc.docstatus === 0
        ) {
            check_employee_objective_window(frm);
        }
    },

    // --------------------------------------------------
    // REFRESH
    // --------------------------------------------------
    refresh: function (frm) { 

        // Re-check window on refresh (important)
        if (
            frappe.user.has_role("Employee") &&
            frm.doc.docstatus === 0
        ) {
            check_employee_objective_window(frm);
        }

        // Reporting Officer window
        if (
            frappe.user.has_role("Reporting Officer") &&
            frm.doc.workflow_state === "Submitted to Reporting Officer"
        ) {
            handle_window_lock(
                frm,
                "Objective Approval By Reporting Officer",
                "ro_window_open",
                __("Reporting Officer – Window is not open")
            );
        }

        // Reviewing Officer window
        if (
            frappe.user.has_role("Reviewing Officer") &&
            frm.doc.workflow_state === "Reviewing Officer Review"
        ) {
            handle_window_lock(
                frm,
                "Objective Approval By Reviewing Officer",
                "rvo_window_open",
                __("Reviewing Officer – Window is not open")
            );
        }

        // Employee Acceptance window
        if (
            frappe.user.has_role("Employee") &&
            frm.doc.workflow_state === "Employee Acceptance Pending"
        ) {
            handle_employee_acceptance_window(frm);
        }

        // Help button
        frm.add_custom_button(__('क्या आपको डेटा डालने में परेशानी हो रही है? Finding it difficult to enter? ClickMe'), function () {
            show_help();
        });
    },

    // --------------------------------------------------
    // FIELD EVENTS
    // --------------------------------------------------
    cycle_name: function (frm) {
        try_cycle_copy(frm);
    },

    employee: function (frm) {
        try_cycle_copy(frm);
    },

    // --------------------------------------------------
    // CHILD TABLE – LIMIT TO 10 ROWS
    // --------------------------------------------------
    objective_add: function (frm) {

        var count = (frm.doc.objective || []).length;

        if (count > 10) {
            frappe.msgprint(__('You cannot add more than 10 objectives.'));
            frm.get_field('objective').grid.grid_rows.pop();
            frm.refresh_field('objective');
        }
    },

    // --------------------------------------------------
    // VALIDATION
    // --------------------------------------------------
    validate: function (frm) {

        var rows = frm.doc.objective || [];
        var total_weightage = 0;
        
        if (rows.length < 5) {
            frappe.msgprint(__('Please add at least 5 objectives.You currently have <b>{0}</b>',[rows.length]));
            frappe.validated = false;
            return;
        }

        if (rows.length > 10) {
            frappe.msgprint(__('You can add maximum 10 objectives.You currently have <b>{0}</b>',[rows.length]));
            frappe.validated = false;
            return;
        }

        rows.forEach(function (r) {
            total_weightage += flt(r.weightage);
        });

        if (total_weightage !== 100) {
            frappe.msgprint(__('Total weightage must be exactly 100%.Current total is <b>{0}%</b>.',
                    [total_weightage]));
            frappe.validated = false;
        }
    }
});

function check_employee_objective_window(frm) {

    // Draft only
    if (frm.doc.docstatus !== 0) return;

    var today = frappe.datetime.get_today();

    // If cycle already known, validate against it
    var cycle = frm.doc.cycle_name || null;

    var filters = {
        activity_type: "Objective Setting",
        start_date: ["<=", today],
        end_date: [">=", today]
    };

    if (cycle) {
        filters.cycle_name = cycle;
    }

    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Appraisal Calendar Period Control",
            filters: filters,
            fields: [
                "name",
                "cycle_name",
                "start_date",
                "end_date",
                "appraisal_year"
            ],
            order_by: "start_date desc",
            limit: 1
        },
        callback: function (r) {

            // ❌ No matching window
            if (!r.message || !r.message.length) {

                frm.doc.__window_closed = true;
                frm.disable_save();

                if (!frm.__window_msg_shown) {
                    frm.__window_msg_shown = true;

                    frappe.msgprint({
                        title: __("Not Allowed"),
                        message: __("🚫 Objective Setting window is not open for this cycle."),
                        indicator: "red"
                    });
                }
                return;
            }

            // ✅ Correct window found
            var control = r.message[0];

            frm.doc.__window_closed = false;
            frm.enable_save();

            // Set values ONLY if empty (do not override)
            if (!frm.doc.appraisal_control) {
                frm.set_value({
                    appraisal_control: control.name,
                    cycle_name: control.cycle_name,
                    start_date: control.start_date,
                    end_date: control.end_date,
                    appraisal_year: control.appraisal_year
                });
            }
        }
    });
}


// ------------------------------------------------------
// Cycle-1 → Cycle-2 Objective Copy 
// ------------------------------------------------------
function try_cycle_copy(frm) {

    if (frm.doc.docstatus !== 0) return;
    if (!frm.doc.employee) return;
    if (!frm.doc.cycle_name) return;

    if (frm.doc.cycle_name.toLowerCase().indexOf("cycle 2") === -1) return;

    // Ignore empty rows
    var has_data = false;

    (frm.doc.objective || []).forEach(function (row) {
        if (row.objective || row.target || row.weightage || row.dependencies) {
            has_data = true;
        }
    });

    if (has_data) return;

    if (frm.__cycle_copy_done) return;
    frm.__cycle_copy_done = true;

    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Employee Objective Setting",
            filters: {
                employee: frm.doc.employee
            },
            fields: ["name", "cycle_name"],
            order_by: "creation desc",
            limit: 5
        },
        callback: function (r) {

            if (!r.message) return;

            var source = null;

            r.message.forEach(function (d) {
                if (
                    d.cycle_name &&
                    d.cycle_name.toLowerCase().indexOf("cycle 1") !== -1
                ) {
                    source = d;
                }
            });

            if (!source) return;

            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Employee Objective Setting",
                    name: source.name
                },
                callback: function (res) {

                    if (!res.message || !res.message.objective) return;

                    frm.clear_table("objective");

                    res.message.objective.forEach(function (row) {
                        var child = frm.add_child("objective");
                        child.objective = row.objective;
                        child.target = row.target;
                        child.weightage = row.weightage;
                        child.dependencies=row.dependencies;
                    });

                    frm.refresh_field("objective");

                    frappe.show_alert({
                        message: __("Objectives copied from Cycle 1"),
                        indicator: "green"
                    });
                }
            });
        }
    });
}


// ------------------------------------------------------
// Window Lock Helpers
// ------------------------------------------------------
function handle_window_lock(frm, activity_type, flag_field, headline_msg) {

    var today = frappe.datetime.get_today();

    frappe.db.get_list("Appraisal Calendar Period Control", {
        filters: {
            activity_type: activity_type,
            cycle_name: frm.doc.cycle_name,
            start_date: ["<=", today],
            end_date: [">=", today]
        },
        fields: ["name"],
        limit: 1
    }).then(function (records) {

        var open = records.length ? 1 : 0;

        if (frm.doc[flag_field] !== open) {
            frm.set_value(flag_field, open);
            frm.save({ silent: true });
        }

        if (!open) {
            lock_form_except_workflow(frm);
            frm.dashboard.set_headline_alert(headline_msg, "red");
        } else {
            unlock_form(frm);
            frm.dashboard.clear_headline();
        }
    });
}


// ------------------------------------------------------
// Employee Acceptance Window
// ------------------------------------------------------

function handle_employee_acceptance_window(frm) {

    lock_form_except_workflow(frm);

    var today = frappe.datetime.get_today();

    frappe.db.get_list("Appraisal Calendar Period Control", {
        filters: {
            activity_type: "Employee Acceptance",
            cycle_name: frm.doc.cycle_name,
            start_date: ["<=", today],
            end_date: [">=", today]
        },
        fields: ["name"],
        limit: 1
    }).then(function (records) {

        var window_open = records.length ? 1 : 0;

        if (frm.doc.employee_window_open !== window_open) {
            frm.set_value("employee_window_open", window_open);
            frm.save({ silent: true });
        }

        if (window_open) {
            frm.dashboard.clear_headline();
        } else {
            frm.dashboard.set_headline_alert(
                __("Employee Acceptance Window is not <b> Open </b>"),
                "red"
            );
        }
    });
}  


// ------------------------------------------------------
// Utilities
// ------------------------------------------------------
function unlock_form(frm) {
    frm.fields.forEach(function (f) {
        frm.set_df_property(f.df.fieldname, "read_only", 0);
    });
}

function lock_form_except_workflow(frm) {
    frm.fields.forEach(function (f) {
        if (f.df.fieldname !== "workflow_state") {
            frm.set_df_property(f.df.fieldname, "read_only", 1);
        }
    });
}

function show_help() {
    frappe.msgprint({
        title: __('Help'),
        message: '<iframe src="/files/help_file.pdf" width="100%" height="500px"></iframe>',
        indicator: 'green'
    });
}
