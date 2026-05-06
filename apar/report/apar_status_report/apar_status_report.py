import frappe

def execute(filters=None):

    filters = filters or {}

    columns = [
        {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 300},
        {"label": "No of Employees", "fieldname": "employee_count", "fieldtype": "Int", "width": 200}
    ]

    # Always fetch ALL first (no filter)
    data = frappe.db.sql("""
        SELECT
            workflow_state AS status,
            COUNT(DISTINCT employee) AS employee_count
        FROM
            `tabEmployee Objective Setting`
        GROUP BY
            workflow_state
        ORDER BY
            workflow_state
    """, as_dict=True)

    # Apply filter manually in Python (100% safe)
    if filters.get("appraisal_year") or filters.get("cycle_name"):

        filtered_data = []

        for row in frappe.db.sql("""
            SELECT workflow_state, employee, appraisal_year, cycle_name
            FROM `tabEmployee Objective Setting`
        """, as_dict=True):

            if filters.get("appraisal_year") and row.appraisal_year != filters.get("appraisal_year"):
                continue

            if filters.get("cycle_name") and row.cycle_name != filters.get("cycle_name"):
                continue

            filtered_data.append(row)

        # Recalculate grouped result
        result = {}
        for r in filtered_data:
            result.setdefault(r.workflow_state, set()).add(r.employee)

        data = [
            {"status": k, "employee_count": len(v)}
            for k, v in result.items()
        ]

    # Chart
    chart = {
        "data": {
            "labels": [row["status"] for row in data],
            "datasets": [{
                "name": "Employees",
                "values": [row["employee_count"] for row in data]
            }]
        },
        "type": "pie"
    }

    # Summary
    summary = [{
        "value": sum(row["employee_count"] for row in data),
        "indicator": "Blue",
        "label": "Total Employees"
    }]

    return columns, data, None, chart, summary

