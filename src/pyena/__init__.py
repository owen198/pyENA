from .rena import (
    ENAData,
    ENASet,
    accumulate_data,
    create_individual_network_plot,
    create_network_plot,
    create_network_with_point_groups_plot,
    create_points_ci_overlay_plot,
    create_points_ci_plot,
    ena,
    find_unit_index,
    generate_analysis_outputs,
    group_mask,
    group_network,
    group_points,
    mann_whitney,
    make_set,
    mean_network,
    plot_network,
    plot_point_set,
    plot_points_with_ci,
    read_csv_records,
    rotate_by_mean,
    save_figure,
    sphere_normalize,
    subtract_networks,
    summarize_ena_results,
    summarize_group_point_tests,
    svd_rotation,
    validate_rs_data,
    welch_ttest,
)

from .plot3d import (
    generate_analysis_outputs_3d,
    plot_network_3d,
    plot_network_with_points_3d,
    plot_points_with_ci_3d,
    save_figure_html,
)


__all__ = [
    "ENAData",
    "ENASet",
    "accumulate_data",
    "create_individual_network_plot",
    "create_network_plot",
    "create_network_with_point_groups_plot",
    "create_points_ci_overlay_plot",
    "create_points_ci_plot",
    "ena",
    "find_unit_index",
    "generate_analysis_outputs",
    "group_mask",
    "group_network",
    "group_points",
    "mann_whitney",
    "make_set",
    "mean_network",
    "plot_network",
    "plot_point_set",
    "plot_points_with_ci",
    "read_csv_records",
    "rotate_by_mean",
    "save_figure",
    "sphere_normalize",
    "subtract_networks",
    "summarize_ena_results",
    "summarize_group_point_tests",
    "svd_rotation",
    "validate_rs_data",
    "welch_ttest",

    # 3D
    "generate_analysis_outputs_3d",
    "plot_network_3d",
    "plot_network_with_points_3d",
    "plot_points_with_ci_3d",
    "save_figure_html",
]
# Native extensions; existing public names above remain available.
from .rena import ena_correlations, ena_correlation, summarize_group, summarize_goodness_of_fit
from .pipeline import (
    ENARotationSet, fit_model, model, project, project_in, center,
    fun_skip_sphere_norm, directed_node_positions,
    directed_node_positions_with_ground_response_added, means_rotate, as_trajectory,
)
from .rotations import (
    GMRResult, gmr, get_x1_main_effect, generalized_rotation,
    hena_rotation, regression_rotation, rotate_by_means,
)
from .data import (
    QEData, as_qe_data, define, reclassify, units, codes, horizon, metadata,
    find_binary_cols, find_code_cols, find_meta_cols, find_dimension_cols,
    accumulate, names_to_adjacency_key, connection_matrix, vector_to_ut,
    combn_c2, merge_columns, ena_conversations,
)
from .visualization import (
    ENAPlot, ena_plot, add_points, add_group, add_nodes, add_network,
    add_trajectory, with_means, with_trajectory, ena_plotter, clear, show, check_range,
    move_nodes_to_unit_circle, move_nodes_to_unit_circle_with_equal_space,
)
from .reporting import json_safe, ena_writeup, methods_report, methods_report_stream
__all__ += [
    'ena_correlations','ena_correlation','summarize_group','summarize_goodness_of_fit',
    'ENARotationSet','fit_model','model','project','project_in','center',
    'fun_skip_sphere_norm','directed_node_positions','directed_node_positions_with_ground_response_added',
    'means_rotate','as_trajectory','GMRResult','gmr','get_x1_main_effect','generalized_rotation',
    'hena_rotation','regression_rotation','rotate_by_means',
    'QEData','as_qe_data','define','reclassify','units','codes','horizon','metadata',
    'find_binary_cols','find_code_cols','find_meta_cols','find_dimension_cols',
    'accumulate','names_to_adjacency_key','connection_matrix','vector_to_ut','combn_c2',
    'merge_columns','ena_conversations','ENAPlot','ena_plot','add_points','add_group',
    'add_nodes','add_network','add_trajectory','with_means','with_trajectory',
    'ena_plotter','clear','show','check_range','move_nodes_to_unit_circle',
    'move_nodes_to_unit_circle_with_equal_space','json_safe','ena_writeup','methods_report','methods_report_stream',
]

from .data import (
    QEColumn, ENAMatrix, as_qe_code, as_qe_unit, as_qe_horizon, as_qe_metadata,
    is_qe_data, is_qe_code, is_qe_unit, is_qe_horizon, is_qe_metadata,
    as_ena_matrix, as_ena_co_occurrence, as_ena_metadata, remove_meta_data,
)
from .visualization import plot_ordered_network_3d
__all__ += ['QEColumn','ENAMatrix','as_qe_code','as_qe_unit','as_qe_horizon','as_qe_metadata',
            'is_qe_data','is_qe_code','is_qe_unit','is_qe_horizon','is_qe_metadata',
            'as_ena_matrix','as_ena_co_occurrence','as_ena_metadata','remove_meta_data','plot_ordered_network_3d']

from .pipeline import optimize, rotate
__all__ += ["optimize", "rotate"]

from .rena import fun_cohens_d, ena_group
__all__ += ["fun_cohens_d", "ena_group"]